import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { mkdir, rm, writeFile, readdir, stat } from 'fs/promises';
import { randomUUID } from 'crypto';
import { startAppApiServer, startStorageApiServer } from './helpers/app-server';
import { ProjectStatus } from '@/shared/constants/status';
import { __resetDaemonConfigForTests, loadConfig as loadDaemonConfigForTests } from '../../scripts/daemon/helpers/config';
import { buildDaemonEnvContent } from '../daemon/helpers/env';

const DAEMON_PASSWORD = 'secret-multilang';
const DAEMON_ID = 'daemon-multilang';
type ExecutorModule = typeof import('../../scripts/daemon/helpers/executor');

type ServerInstance = Awaited<ReturnType<typeof startAppApiServer>>;
type StorageInstance = Awaited<ReturnType<typeof startStorageApiServer>>;

describe('Multi-language project flows', () => {
  let app: ServerInstance | null = null;
  let storage: StorageInstance | null = null;
  let workspaceRoot: string;

  beforeEach(async () => {
    delete (globalThis as any).__vtPrisma;
    process.env.DATABASE_URL = 'file:virtual';
    workspaceRoot = path.resolve('tests/daemon-and-api/workspaces', `workspace-${randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const mediaRoot = path.join(workspaceRoot, 'media');
    storage = await startStorageApiServer({ daemonPassword: DAEMON_PASSWORD, mediaRoot });
    app = await startAppApiServer({ daemonPassword: DAEMON_PASSWORD, mediaRoot, storagePublicUrl: storage.baseUrl });
  });

  afterEach(async () => {
    try { if (app) await app.close(); } catch {}
    try { if (storage) await storage.close(); } catch {}
    try { await rm(workspaceRoot, { recursive: true, force: true }); } catch {}
  });

  it('persists requested languages and queues script job with language payload', async () => {
    const createRes = await fetch(new URL('/api/projects', app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Produce a teaser',
        durationSeconds: 45,
        characterSelection: { source: 'dynamic' },
        languages: ['en', 'es', 'de'],
      }),
    });
    expect(createRes.ok).toBe(true);
    const created = await createRes.json() as { id: string };
    const projectId = created.id;
    expect(typeof projectId).toBe('string');

    const prisma = (globalThis as any).__vtPrisma;
    const project = prisma?._db?.projects.get(projectId);
    expect(project?.languages).toEqual(['en', 'es', 'de']);

    const jobs = Array.from(prisma._db.jobs.values()) as any[];
    const scriptJob = jobs.find((job: any) => job.projectId === projectId && job.type === 'script') as any;
    expect(scriptJob).toBeTruthy();
    expect(scriptJob.payload.languages).toEqual(['en', 'es', 'de']);
    expect(scriptJob.payload.primaryLanguage).toBe('en');
    expect(scriptJob.payload.targetLanguage).toBe('en');

    const snapshotRes = await fetch(new URL(`/api/daemon/projects/${projectId}/creation-snapshot`, app!.baseUrl), {
      headers: { 'x-daemon-password': DAEMON_PASSWORD, 'x-daemon-id': DAEMON_ID },
    });
    expect(snapshotRes.ok).toBe(true);
    const snapshot = await snapshotRes.json();
    expect(snapshot.targetLanguage).toBe('en');
    expect(snapshot.languages).toEqual(['en', 'es', 'de']);
  });

  it('exposes per-language variants with localized scripts and audios', async () => {
    const projectId = await createProject(['en', 'es']);

    await daemonUpsertScript(projectId, 'en', 'English script body');
    await daemonUpsertScript(projectId, 'es', 'Guion en español');

    const englishAudio = await daemonUploadAudio(projectId, 'en');
    await daemonUploadAudio(projectId, 'es');

    const prisma = (globalThis as any).__vtPrisma;
    await prisma.project.update({ where: { id: projectId }, data: { status: 'process_audio_validate', finalVoiceoverId: englishAudio.id } });

    const detailRes = await fetch(new URL(`/api/projects/${projectId}`, app!.baseUrl), {
      headers: { cookie: 'auth=test' },
    });
    expect(detailRes.ok).toBe(true);
    const detail = await detailRes.json();

    expect(detail.languages).toEqual(['en', 'es']);
    const variants = detail.languageVariants as Array<any>;
    expect(Array.isArray(variants)).toBe(true);
    expect(variants.length).toBe(2);

    const enVariant = variants.find((variant) => variant.languageCode === 'en') as any;
    expect(enVariant).toBeTruthy();
    expect(enVariant.scriptText).toContain('English script body');
    expect(enVariant.audioCandidates[0].languageCode).toBe('en');
    const expectedEnPrefix = new URL('/api/media/', storage!.baseUrl).toString();
    expect(typeof enVariant.finalVoiceoverPath).toBe('string');
    expect(enVariant.finalVoiceoverPath.startsWith(expectedEnPrefix)).toBe(true);
    expect(enVariant.finalVoiceoverPath.includes(projectId)).toBe(true);

    const esVariant = variants.find((variant) => variant.languageCode === 'es') as any;
    expect(esVariant).toBeTruthy();
    expect(esVariant.scriptText).toContain('Guion en español');
    expect(esVariant.audioCandidates[0].languageCode).toBe('es');
    expect(esVariant.finalVoiceoverPath).toBeNull();
  });

  it('regenerates only the targeted language audio and queues localized job', async () => {
    const projectId = await createProject(['en', 'es']);
    await daemonUpsertScript(projectId, 'en', 'English script');
    await daemonUpsertScript(projectId, 'es', 'Script español');
    await daemonUploadAudio(projectId, 'en');
    await daemonUploadAudio(projectId, 'es');

    const regenRes = await fetch(new URL(`/api/projects/${projectId}/audios/regenerate`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'auth=test' },
      body: JSON.stringify({ languageCode: 'es' }),
    });
    if (!regenRes.ok) {
      const text = await regenRes.text().catch(() => '<no-body>');
      throw new Error(`Failed to request regeneration (${regenRes.status}): ${text}`);
    }
    const regen = await regenRes.json();
    expect(regen.languageCode).toBe('es');

    const prisma = (globalThis as any).__vtPrisma;
    const remainingAudios = Array.from(prisma._db.audioCandidates.values()).filter((audio: any) => audio.projectId === projectId) as any[];
    expect(remainingAudios.some((audio: any) => audio.languageCode === 'en')).toBe(true);
    expect(remainingAudios.some((audio: any) => audio.languageCode === 'es')).toBe(false);

    const audioJobs = Array.from(prisma._db.jobs.values()).filter((job: any) => job.projectId === projectId && job.type === 'audio') as any[];
    expect(audioJobs.length).toBe(1);
    expect(audioJobs[0].payload.audioLanguage).toBe('es');
  });

  it('approves audio for all languages and marks finalists', async () => {
    const projectId = await createProject(['en', 'es']);
    await daemonUpsertScript(projectId, 'en', 'English script body');
    await daemonUpsertScript(projectId, 'es', 'Guion en español');
    const enAudio = await daemonUploadAudio(projectId, 'en');
    const esAudio = await daemonUploadAudio(projectId, 'es');

    const res = await fetch(new URL(`/api/projects/${projectId}/audios/approve`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'auth=test' },
      body: JSON.stringify({ selections: [
        { languageCode: 'en', audioId: enAudio.id },
        { languageCode: 'es', audioId: esAudio.id },
      ] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no-body>');
      throw new Error(`Audio approval failed: ${res.status} ${text}`);
    }

    const prisma = (globalThis as any).__vtPrisma;
    const project = prisma._db.projects.get(projectId);
    expect(project?.status).toBe(ProjectStatus.ProcessTranscription);
    expect(project?.finalVoiceoverId).toBe(enAudio.id);

    const candidates = Array.from(prisma._db.audioCandidates.values()).filter((row: any) => row.projectId === projectId);
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: enAudio.id, languageCode: 'en', isFinal: true }),
      expect.objectContaining({ id: esAudio.id, languageCode: 'es', isFinal: true }),
    ]));

    const history = (Array.from(prisma._db.projectStatusHistory.values()) as any[]).filter((row) => row.projectId === projectId);
    const last: any = history[history.length - 1] || null;
    expect(last?.status).toBe(ProjectStatus.ProcessTranscription);
    expect(last?.extra?.finalVoiceovers).toEqual({ en: enAudio.id, es: esAudio.id });
  });

  it('auto-approves audio and transcribes all languages', async () => {
    const languages = ['en', 'es'];
    const projectId = await createProject(languages);

    const prisma = (globalThis as any).__vtPrisma;
    const scriptJob = Array.from(prisma._db.jobs.values()).find((job: any) => job.projectId === projectId && job.type === 'script') as any;
    expect(scriptJob).toBeTruthy();

    const envPath = await makeDaemonEnv('daemon-audio.env');
    await runWithExecutor(envPath, async ({ executeForProject }) => {
      await executeForProject(projectId, ProjectStatus.ProcessScript, scriptJob.payload);
      scriptJob.status = 'done';

      await executeForProject(projectId, ProjectStatus.ProcessAudio, {});

      const candidates = Array.from(prisma._db.audioCandidates.values()).filter((row: any) => row.projectId === projectId);
      expect(candidates).toEqual(expect.arrayContaining([
        expect.objectContaining({ languageCode: 'en', isFinal: true }),
        expect.objectContaining({ languageCode: 'es', isFinal: true }),
      ]));

      const transcriptionJobs = getTranscriptionJobs(prisma, projectId);
      expect(transcriptionJobs).toHaveLength(languages.length);

      for (const job of transcriptionJobs) {
        await executeForProject(projectId, ProjectStatus.ProcessTranscription, job.payload ?? {});
        job.status = 'done';
      }
    });

    const progressRows = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    expect(progressRows.every((row: any) => row.transcriptionDone)).toBe(true);

    const history = (Array.from(prisma._db.projectStatusHistory.values()) as any[]).filter((row) => row.projectId === projectId);
    const metadataEntry = history.find((row: any) => row.status === ProjectStatus.ProcessMetadata);
    expect(metadataEntry?.extra?.transcriptionLanguages).toEqual(languages);

    const videoEnvPath = await makeDaemonEnv('daemon-video.env');
    await runWithExecutor(videoEnvPath, async ({ executeForProject }) => {
      let safety = 0;
      while (true) {
        const currentStatus = prisma._db.projects.get(projectId)?.status as ProjectStatus | undefined;
        if (!currentStatus || currentStatus === ProjectStatus.Done) break;
        safety += 1;
        expect(safety).toBeLessThan(50);
        await executeForProject(projectId, currentStatus, {});
      }
    });

    const finalProject = prisma._db.projects.get(projectId);
    expect(finalProject?.status).toBe(ProjectStatus.Done);

    const finalProgress = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    const pendingFinal = finalProgress.filter((row: any) => !(row.transcriptionDone && row.captionsDone && row.videoPartsDone && row.finalVideoDone));
    expect(pendingFinal).toEqual([]);

    const finalVideos = Array.from(prisma._db.videoAssets.values()).filter((row: any) => row.projectId === projectId && row.isFinal);
    expect(finalVideos).toEqual(expect.arrayContaining([
      expect.objectContaining({ languageCode: 'en', isFinal: true }),
      expect.objectContaining({ languageCode: 'es', isFinal: true }),
    ]));

    const detailRes = await fetch(new URL(`/api/projects/${projectId}`, app!.baseUrl), {
      headers: { cookie: 'auth=test' },
    });
    expect(detailRes.ok).toBe(true);
    const detail = await detailRes.json() as { languageVariants: Array<any> };
    expect(detail.languageVariants).toEqual(expect.arrayContaining([
      expect.objectContaining({ languageCode: 'en', finalVideoPath: expect.any(String) }),
      expect.objectContaining({ languageCode: 'es', finalVideoPath: expect.any(String) }),
    ]));

    // Verify workspace structure per language
    const projectRootDir = path.join(workspaceRoot, projectId);
    const topLevelEntries = new Set(await readdir(projectRootDir));
    expect(topLevelEntries).toEqual(new Set(['logs', 'workspace']));

    const projectLogsDir = path.join(projectRootDir, 'logs');
    const logEntries = new Set(await readdir(projectLogsDir));
    for (const language of languages) {
      expect(logEntries.has(language)).toBe(true);
    }
    for (const entry of logEntries) {
      expect(['errors', ...languages]).toContain(entry);
    }

    const projectWorkspace = path.join(projectRootDir, 'workspace');
    const requiredDirs = ['metadata', 'captions-video', 'video-basic-effects', 'video-merge-layers'];
    for (const language of languages) {
      const langWorkspace = path.join(projectWorkspace, language);
      await stat(langWorkspace);
      for (const dir of requiredDirs) {
        await stat(path.join(langWorkspace, dir));
      }
      const langFiles = await readdir(path.join(langWorkspace, 'video-merge-layers'));
      expect(langFiles.some((file) => file.endsWith('.mp4'))).toBe(true);
      const transcriptionLogDir = path.join(projectLogsDir, language, 'transcription');
      await stat(transcriptionLogDir);
    }
  }, 60000);

  it('skips failed languages during metadata and video parts phases', async () => {
    const languages = ['en', 'es', 'fr', 'de'];
    const projectId = await createProject(languages);

    const prisma = (globalThis as any).__vtPrisma;
    const scriptJob = Array.from(prisma._db.jobs.values()).find((job: any) => job.projectId === projectId && job.type === 'script') as any;
    expect(scriptJob).toBeTruthy();

    let metadataFailureInjected = false;
    let videoPartsFailureInjected = false;
    const envPath = await makeDaemonEnv('daemon-partial-failures.env');

    await runWithExecutor(envPath, async ({ executeForProject }) => {
      await executeForProject(projectId, ProjectStatus.ProcessScript, scriptJob.payload);
      scriptJob.status = 'done';

      let guard = 0;
      while (true) {
        const currentStatus = prisma._db.projects.get(projectId)?.status as ProjectStatus | undefined;
        if (!currentStatus || currentStatus === ProjectStatus.Done) break;
        expect(currentStatus).not.toBe(ProjectStatus.Error);
        guard += 1;
        expect(guard).toBeLessThan(120);

        if (!metadataFailureInjected && currentStatus === ProjectStatus.ProcessMetadata) {
          await fetch(new URL(`/api/daemon/projects/${projectId}/language-progress`, app!.baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-daemon-password': DAEMON_PASSWORD, 'x-daemon-id': DAEMON_ID },
            body: JSON.stringify({
              languageCode: 'es',
              disabled: true,
              failedStep: 'metadata',
              failureReason: 'Metadata mocked failure',
            }),
          });
          metadataFailureInjected = true;
        }

        if (!videoPartsFailureInjected && currentStatus === ProjectStatus.ProcessImagesGeneration) {
          await fetch(new URL(`/api/daemon/projects/${projectId}/language-progress`, app!.baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-daemon-password': DAEMON_PASSWORD, 'x-daemon-id': DAEMON_ID },
            body: JSON.stringify({
              languageCode: 'fr',
              disabled: true,
              failedStep: 'video_parts',
              failureReason: 'Video parts mocked failure',
            }),
          });
          videoPartsFailureInjected = true;
        }

        await executeForProject(projectId, currentStatus, {});
      }
    });

    const projectRecord = prisma._db.projects.get(projectId);
    expect(projectRecord?.status).toBe(ProjectStatus.Done);

    const progressRows = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    const byLanguage: Record<string, any> = {};
    for (const row of progressRows as any[]) {
      byLanguage[row.languageCode] = row;
    }
    expect(byLanguage.en.finalVideoDone).toBe(true);
    expect(byLanguage.de.finalVideoDone).toBe(true);
    expect(byLanguage.es.disabled).toBe(true);
    expect(byLanguage.es.failedStep).toBe('metadata');
    expect(byLanguage.fr.disabled).toBe(true);
    expect(byLanguage.fr.failedStep).toBe('video_parts');

    const finalVideos = Array.from(prisma._db.videoAssets.values()).filter((row: any) => row.projectId === projectId && row.isFinal);
    expect(finalVideos.some((row: any) => row.languageCode === 'en')).toBe(true);
    expect(finalVideos.some((row: any) => row.languageCode === 'de')).toBe(true);
    expect(finalVideos.some((row: any) => row.languageCode === 'es')).toBe(false);
    expect(finalVideos.some((row: any) => row.languageCode === 'fr')).toBe(false);

    const history = (Array.from(prisma._db.projectStatusHistory.values()) as any[]).filter((row) => row.projectId === projectId);
    const doneEntry = history.find((row) => row.status === ProjectStatus.Done);
    expect(doneEntry?.extra?.failedLanguages?.sort()).toEqual(['es', 'fr']);
  }, 60000);

  it('resumes transcription jobs after restart', async () => {
    const languages = ['en', 'es', 'fr'];
    const projectId = await createProject(languages);

    const prisma = (globalThis as any).__vtPrisma;
    const scriptJob = Array.from(prisma._db.jobs.values()).find((job: any) => job.projectId === projectId && job.type === 'script') as any;
    expect(scriptJob).toBeTruthy();

    const envPath = await makeDaemonEnv('daemon-transcription.env');

    let transcriptionJobs: any[] = [];
    let firstLanguage: string | null = null;

    await runWithExecutor(envPath, async (executor) => {
      const { executeForProject } = executor;
      await executeForProject(projectId, ProjectStatus.ProcessScript, scriptJob.payload);
      scriptJob.status = 'done';

      await executeForProject(projectId, ProjectStatus.ProcessAudio, {});

      transcriptionJobs = getTranscriptionJobs(prisma, projectId);
      expect(transcriptionJobs).toHaveLength(languages.length);

      const [firstJob] = transcriptionJobs;
      firstLanguage = (firstJob?.payload?.languageCode || '').toLowerCase() || null;
      await executeForProject(projectId, ProjectStatus.ProcessTranscription, firstJob?.payload ?? {});
      if (firstJob) firstJob.status = 'done';
    });

    const progressAfterFirst = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    const completedLanguages = progressAfterFirst.filter((row: any) => row.transcriptionDone).map((row: any) => row.languageCode);
    expect(completedLanguages).toHaveLength(1);
    if (firstLanguage) {
      expect(completedLanguages[0]).toBe(firstLanguage);
    }

    let projectRecord = prisma._db.projects.get(projectId);
    expect(projectRecord?.status).toBe(ProjectStatus.ProcessTranscription);

    const remainingJobs = transcriptionJobs.filter((job: any) => job.status !== 'done');
    expect(remainingJobs).toHaveLength(languages.length - 1);

    await app?.close();
    app = await startAppApiServer({ daemonPassword: DAEMON_PASSWORD, mediaRoot: path.join(workspaceRoot, 'media'), storagePublicUrl: storage!.baseUrl });
    const restartEnvPath = await makeDaemonEnv('daemon-transcription-restart.env');

    await runWithExecutor(restartEnvPath, async (executor) => {
      const { executeForProject, __setDaemonConfigForTests: setDaemonConfig } = executor as any;
      __resetDaemonConfigForTests();
      if (typeof setDaemonConfig === 'function') {
        setDaemonConfig(loadDaemonConfigForTests());
      }
      for (const job of remainingJobs) {
        await executeForProject(projectId, ProjectStatus.ProcessTranscription, job.payload ?? {});
        job.status = 'done';
      }
    });

    const progressFinal = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    expect(progressFinal.every((row: any) => row.transcriptionDone)).toBe(true);

    projectRecord = prisma._db.projects.get(projectId);
    expect(projectRecord?.status).toBe(ProjectStatus.ProcessMetadata);

    const history = (Array.from(prisma._db.projectStatusHistory.values()) as any[]).filter((row) => row.projectId === projectId);
    const transcriptionLog = history.filter((row: any) => row.status === ProjectStatus.ProcessTranscription);
    expect(transcriptionLog.some((entry: any) => Array.isArray(entry.extra?.pendingLanguages) && entry.extra.pendingLanguages.length > 0)).toBe(true);
    const metadataEntry = history.find((row: any) => row.status === ProjectStatus.ProcessMetadata);
    expect(metadataEntry?.extra?.transcriptionLanguages).toEqual(expect.arrayContaining(languages));
  }, 20000);

  it('generates primary script and translations for every project language before advancing', async () => {
    const languages = ['en', 'es', 'fr'];
    const projectId = await createProject(languages);

    const prisma = (globalThis as any).__vtPrisma;
    const scriptJob = Array.from(prisma._db.jobs.values()).find((job: any) => job.projectId === projectId && job.type === 'script') as any;
    expect(scriptJob).toBeTruthy();

    const envPath = await makeDaemonEnv('daemon-script-primary.env');
    process.env.DAEMON_ENV_FILE = envPath;
    __resetDaemonConfigForTests();
    const executor = await import('../../scripts/daemon/helpers/executor');
    const configModule = await import('../../scripts/daemon/helpers/config');
    const cfg = configModule.loadConfig();
    cfg.apiBaseUrl = app!.baseUrl;
    cfg.storageBaseUrl = storage!.baseUrl;
    cfg.projectsWorkspace = workspaceRoot;
    if (typeof (executor as any).__setDaemonConfigForTests === 'function') {
      (executor as any).__setDaemonConfigForTests(cfg);
    }

    try {
      await executor.executeForProject(projectId, ProjectStatus.ProcessScript, scriptJob.payload);
    } finally {
      delete process.env.DAEMON_ENV_FILE;
      __resetDaemonConfigForTests();
    }

    const scripts = (Array.from(prisma._db.scripts.values()) as any[]).filter((row) => row.projectId === projectId);
    expect(scripts).toHaveLength(languages.length);
    const byLanguage: Record<string, string> = {};
    for (const row of scripts) {
      byLanguage[row.languageCode] = row.text;
    }
    expect(byLanguage.en).toContain('DUMMY TEXT FOR PROMPT');
    expect(byLanguage.es).toContain('(Español)');
    expect(byLanguage.fr).toContain('(Français)');

    const project = prisma._db.projects.get(projectId);
    expect(project?.status).toBe('process_audio');

    const history = (Array.from(prisma._db.projectStatusHistory.values()) as any[]).filter((row) => row.projectId === projectId);
    const finalEntry: any = history[history.length - 1] || null;
    expect(finalEntry?.status).toBe('process_audio');
    expect(finalEntry?.extra?.scriptLanguages).toEqual(languages);
    expect(finalEntry?.extra?.translatedLanguages).toEqual(languages.slice(1));
  }, 20000);

  it('approves scripts for all languages simultaneously', async () => {
    const projectId = await createProject(['en', 'es']);
    const prisma = (globalThis as any).__vtPrisma;
    await prisma.project.update({ where: { id: projectId }, data: { status: 'process_script_validate' } });

    const res = await fetch(new URL(`/api/projects/${projectId}/script/approve`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scripts: [
          { languageCode: 'en', text: 'Approved English script body '.repeat(15) },
          { languageCode: 'es', text: 'Guion aprobado en español '.repeat(15) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<no-body>');
      throw new Error(`Script approval failed: ${res.status} ${body}`);
    }

    const scripts = Array.from(prisma._db.scripts.values()).filter((row: any) => row.projectId === projectId);
    expect(scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ languageCode: 'en', text: 'Approved English script body '.repeat(15).trim() }),
        expect.objectContaining({ languageCode: 'es', text: 'Guion aprobado en español '.repeat(15).trim() }),
      ]),
    );

    const project = prisma._db.projects.get(projectId);
    expect(project?.finalScriptText).toBe('Approved English script body '.repeat(15).trim());
    expect(project?.status).toBe('process_audio');
  });

  it('rejects script approval when not all languages are provided', async () => {
    const projectId = await createProject(['en', 'es']);
    const prisma = (globalThis as any).__vtPrisma;
    await prisma.project.update({ where: { id: projectId }, data: { status: 'process_script_validate' } });

    const res = await fetch(new URL(`/api/projects/${projectId}/script/approve`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scripts: [
          { languageCode: 'en', text: 'Only English provided' },
        ],
      }),
    });
    expect(res.ok).toBe(false);
    const body = await res.text().catch(() => '<no-body>');
    expect(res.status).toBe(400);

    const scripts = Array.from(prisma._db.scripts.values()).filter((row: any) => row.projectId === projectId);
    expect(scripts.length).toBe(0);
    const project = prisma._db.projects.get(projectId);
    expect(project?.status).toBe('process_script_validate');
  });

  it('requests script refinement for a specific language', async () => {
    const projectId = await createProject(['en', 'es']);
    const prisma = (globalThis as any).__vtPrisma;

    const res = await fetch(new URL(`/api/projects/${projectId}/script/request`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Make the Spanish script shorter', languageCode: 'es' }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<no-body>');
      throw new Error(`Script refinement request failed: ${res.status} ${body}`);
    }

    const project = prisma._db.projects.get(projectId);
    expect(project?.status).toBe('process_script');

    const jobs = Array.from(prisma._db.jobs.values()).filter((job: any) => job.projectId === projectId && job.type === 'script');
    expect(jobs.length).toBeGreaterThan(0);
    const lastJob = jobs[jobs.length - 1] as any;
    expect(lastJob.payload.languageCode).toBe('es');
    expect(lastJob.payload.languages).toEqual(['es']);
    expect(lastJob.payload.refinePropagateTranslations).toBe(true);
  });

  it('propagates refined script to other languages when translation is requested', async () => {
    const projectId = await createProject(['en', 'ru', 'it']);
    const prisma = (globalThis as any).__vtPrisma;
    const initialEnglish = 'Original English script';
    const initialItalian = 'Script italiano originale';
    const initialRussian = 'Исходный русский текст';

    await daemonUpsertScript(projectId, 'en', initialEnglish);
    await daemonUpsertScript(projectId, 'ru', initialRussian);
    await daemonUpsertScript(projectId, 'it', initialItalian);

    const refineBody = {
      text: 'Сделайте текст более дружелюбным и короче.',
      languageCode: 'ru',
      propagateTranslations: true,
    };
    const refineRes = await fetch(new URL(`/api/projects/${projectId}/script/request`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(refineBody),
    });
    if (!refineRes.ok) {
      const body = await refineRes.text().catch(() => '<no-body>');
      throw new Error(`Script refinement request failed: ${refineRes.status} ${body}`);
    }

    const jobs = Array.from(prisma._db.jobs.values()).filter((job: any) => job.projectId === projectId && job.type === 'script');
    expect(jobs.length).toBeGreaterThan(0);
    const refineJob = jobs[jobs.length - 1] as any;
    expect(refineJob.payload.refinePropagateTranslations).toBe(true);

    const envPath = await makeDaemonEnv('daemon-refine-propagate.env');
    await runWithExecutor(envPath, async ({ executeForProject }) => {
      await executeForProject(projectId, ProjectStatus.ProcessScript, refineJob.payload);
      refineJob.status = 'done';
    });

    const scripts = (Array.from(prisma._db.scripts.values()) as any[]).filter((row) => row.projectId === projectId);
    const ruScript = scripts.find((row) => row.languageCode === 'ru') as any | undefined;
    const enScript = scripts.find((row) => row.languageCode === 'en') as any | undefined;
    const itScript = scripts.find((row) => row.languageCode === 'it') as any | undefined;

    expect(ruScript?.text).toBeTruthy();
    expect(ruScript?.text).not.toBe(initialRussian);
    expect(ruScript?.text).toMatch(/^REFINED\(/);
    expect(enScript?.text).toBe(`(English) ${ruScript?.text}`);
    expect(itScript?.text).toBe(`(Italiano) ${ruScript?.text}`);
  });

  it('keeps other languages unchanged when refinement skips translation', async () => {
    const projectId = await createProject(['en', 'ru', 'it']);
    const prisma = (globalThis as any).__vtPrisma;
    const initialEnglish = 'English baseline script';
    const initialItalian = 'Testo italiano di base';
    const initialRussian = 'Исходная русская версия';

    await daemonUpsertScript(projectId, 'en', initialEnglish);
    await daemonUpsertScript(projectId, 'ru', initialRussian);
    await daemonUpsertScript(projectId, 'it', initialItalian);

    const refineRes = await fetch(new URL(`/api/projects/${projectId}/script/request`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Сделайте текст более эмоциональным.',
        languageCode: 'ru',
        propagateTranslations: false,
      }),
    });
    if (!refineRes.ok) {
      const body = await refineRes.text().catch(() => '<no-body>');
      throw new Error(`Script refinement request failed: ${refineRes.status} ${body}`);
    }

    const jobs = Array.from(prisma._db.jobs.values()).filter((job: any) => job.projectId === projectId && job.type === 'script');
    expect(jobs.length).toBeGreaterThan(0);
    const refineJob = jobs[jobs.length - 1] as any;
    expect(refineJob.payload.refinePropagateTranslations).toBe(false);

    const envPath = await makeDaemonEnv('daemon-refine-skip.env');
    await runWithExecutor(envPath, async ({ executeForProject }) => {
      await executeForProject(projectId, ProjectStatus.ProcessScript, refineJob.payload);
      refineJob.status = 'done';
    });

    const scripts = (Array.from(prisma._db.scripts.values()) as any[]).filter((row) => row.projectId === projectId);
    const ruScript = scripts.find((row) => row.languageCode === 'ru') as any | undefined;
    const enScript = scripts.find((row) => row.languageCode === 'en') as any | undefined;
    const itScript = scripts.find((row) => row.languageCode === 'it') as any | undefined;

    expect(ruScript?.text).toBeTruthy();
    expect(ruScript?.text).not.toBe(initialRussian);
    expect(ruScript?.text).toMatch(/^REFINED\(/);
    expect(enScript?.text).toBe(initialEnglish);
    expect(itScript?.text).toBe(initialItalian);
  });

  async function createProject(languages: string[]): Promise<string> {
    const res = await fetch(new URL('/api/projects', app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'auth=test' },
      body: JSON.stringify({
        prompt: 'Create a multi-language video',
        durationSeconds: 30,
        characterSelection: { source: 'dynamic' },
        languages,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no-body>');
      throw new Error(`Failed to create project (${res.status}): ${text}`);
    }
    const created = await res.json() as { id: string };
    return created.id;
  }

  async function daemonUpsertScript(projectId: string, languageCode: string, text: string) {
    const res = await fetch(new URL(`/api/daemon/projects/${projectId}/script`, app!.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-daemon-password': DAEMON_PASSWORD,
        'x-daemon-id': DAEMON_ID,
      },
      body: JSON.stringify({ text, languageCode }),
    });
    expect(res.ok).toBe(true);
  }

  async function daemonUploadAudio(projectId: string, languageCode: string) {
    const mediaUrl = new URL(
      `/api/media/projects/${projectId}/${languageCode}-${randomUUID()}.mp3`,
      storage!.baseUrl,
    ).toString();
    const res = await fetch(new URL(`/api/daemon/projects/${projectId}/assets`, app!.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-daemon-password': DAEMON_PASSWORD,
        'x-daemon-id': DAEMON_ID,
      },
      body: JSON.stringify({
        type: 'audio',
        url: mediaUrl,
        path: mediaUrl,
        languageCode,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no-body>');
      throw new Error(`Failed to upload audio (${res.status}): ${text}`);
    }
    const payload = await res.json() as { id: string };
    return payload;
  }

  async function makeDaemonEnv(filename: string) {
    const envContent = buildDaemonEnvContent({
      apiBaseUrl: app!.baseUrl,
      storageBaseUrl: storage!.baseUrl,
      password: DAEMON_PASSWORD,
      projectsWorkspace: workspaceRoot,
      overrides: {
        taskTimeoutSeconds: 30,
        requestTimeoutMs: 2000,
      },
    });
    const envPath = path.join(workspaceRoot, filename);
    await writeFile(envPath, envContent, 'utf8');
    return envPath;
  }

  async function runWithExecutor(envPath: string, cb: (mod: ExecutorModule) => Promise<void>) {
    process.env.DAEMON_ENV_FILE = envPath;
    __resetDaemonConfigForTests();
    const mod: ExecutorModule = await import('../../scripts/daemon/helpers/executor');
    if (typeof (mod as any).__setDaemonConfigForTests === 'function') {
      (mod as any).__setDaemonConfigForTests(loadDaemonConfigForTests());
    }
    try {
      await cb(mod);
    } finally {
      delete process.env.DAEMON_ENV_FILE;
    }
  }

  function getTranscriptionJobs(prismaInstance: any, projectId: string) {
    const jobs = Array.from(prismaInstance._db.jobs.values()) as any[];
    return jobs
      .filter((job) => job.projectId === projectId && job.type === 'transcription')
      .sort((a, b) => {
        const langA = (a.payload?.languageCode || '').toString();
        const langB = (b.payload?.languageCode || '').toString();
        return langA.localeCompare(langB);
      });
  }
});
