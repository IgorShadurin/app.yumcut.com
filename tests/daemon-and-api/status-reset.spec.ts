import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { ProjectStatus } from '@/shared/constants/status';
import { startAppApiServer, startStorageApiServer } from './helpers/app-server';
import { __resetDaemonConfigForTests, loadConfig as loadDaemonConfigForTests } from '../../scripts/daemon/helpers/config';
import { buildDaemonEnvContent } from '../daemon/helpers/env';

type ServerInstance = Awaited<ReturnType<typeof startAppApiServer>>;
type StorageInstance = Awaited<ReturnType<typeof startStorageApiServer>>;
type ExecutorModule = typeof import('../../scripts/daemon/helpers/executor');

const DAEMON_PASSWORD = 'secret-status-reset';

describe('Admin status resets', () => {
  let app: ServerInstance | null = null;
  let storage: StorageInstance | null = null;
  let workspaceRoot: string;
  let logSpies: Array<ReturnType<typeof vi.spyOn>> = [];

  beforeEach(async () => {
    delete (globalThis as any).__vtPrisma;
    process.env.DATABASE_URL = 'file:virtual';
    const { log } = await import('../../scripts/daemon/helpers/logger');
    logSpies = [
      vi.spyOn(log, 'info').mockImplementation(() => {}),
      vi.spyOn(log, 'warn').mockImplementation(() => {}),
      vi.spyOn(log, 'debug').mockImplementation(() => {}),
    ];
    workspaceRoot = path.resolve('tests/daemon-and-api/workspaces', `workspace-${randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const mediaRoot = path.join(workspaceRoot, 'media');
    storage = await startStorageApiServer({ daemonPassword: DAEMON_PASSWORD, mediaRoot });
    app = await startAppApiServer({
      daemonPassword: DAEMON_PASSWORD,
      mediaRoot,
      storagePublicUrl: storage.baseUrl,
      isAdmin: true,
    });
  });

  afterEach(async () => {
    try { if (app) await app.close(); } catch {}
    try { if (storage) await storage.close(); } catch {}
    try { await rm(workspaceRoot, { recursive: true, force: true }); } catch {}
    for (const spy of logSpies) {
      spy.mockRestore();
    }
    logSpies = [];
  });

it('replays downstream pipeline stages after admin status rollback by default', async () => {
    const projectId = await createProject();
    const prisma = (globalThis as any).__vtPrisma;

    await executeUntilDone(prisma, projectId, { runScript: true });

    const projectDone = prisma._db.projects.get(projectId);
    expect(projectDone?.status).toBe(ProjectStatus.Done);
    const finalAssetsBefore = Array.from(prisma._db.videoAssets.values()).filter((asset: any) => asset.projectId === projectId && asset.isFinal);
    expect(finalAssetsBefore.length).toBeGreaterThan(0);
    const initialFinal = finalAssetsBefore[0] as { path: string } | undefined;
    if (!initialFinal) {
      throw new Error('Expected a final video asset before reset');
    }
    const initialFinalPath = initialFinal.path;
    const initialFinalUrl = projectDone?.finalVideoUrl ?? null;

    const progressBefore = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    expect(progressBefore.every((row: any) => row.captionsDone && row.videoPartsDone && row.finalVideoDone)).toBe(true);

    const historyBefore = Array.from(prisma._db.projectStatusHistory.values()).filter((row: any) => row.projectId === projectId);
    const historyBeforeCount = historyBefore.length;

    const adminRes = await fetch(new URL(`/api/admin/projects/${projectId}/status`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: ProjectStatus.ProcessCaptionsVideo }),
    });
    if (!adminRes.ok) {
      const failureBody = await adminRes.text().catch(() => '<no-body>');
      throw new Error(`Admin status update failed (${adminRes.status}): ${failureBody}`);
    }
    expect(adminRes.ok).toBe(true);

    const projectAfterReset = prisma._db.projects.get(projectId);
    expect(projectAfterReset?.status).toBe(ProjectStatus.ProcessCaptionsVideo);
    expect(projectAfterReset?.finalVideoPath).toBeNull();
    expect(projectAfterReset?.finalVideoUrl).toBeNull();

    const progressAfterReset = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    expect(progressAfterReset.every((row: any) => !row.captionsDone)).toBe(true);
    expect(progressAfterReset.every((row: any) => !row.videoPartsDone)).toBe(true);
    expect(progressAfterReset.every((row: any) => !row.finalVideoDone)).toBe(true);

    const finalAssetsReset = Array.from(prisma._db.videoAssets.values()).filter((asset: any) => asset.projectId === projectId && asset.isFinal);
    expect(finalAssetsReset.length).toBe(0);

    await executeUntilDone(prisma, projectId);

    const projectAfterRerun = prisma._db.projects.get(projectId);
    expect(projectAfterRerun?.status).toBe(ProjectStatus.Done);
    expect(projectAfterRerun?.finalVideoUrl && projectAfterRerun.finalVideoUrl.length > 0).toBe(true);
    if (initialFinalUrl) {
      expect(projectAfterRerun?.finalVideoUrl).not.toBe(initialFinalUrl);
    }

    const finalAssetsAfter = Array.from(prisma._db.videoAssets.values()).filter((asset: any) => asset.projectId === projectId && asset.isFinal);
    expect(finalAssetsAfter.length).toBeGreaterThan(0);
    const latestFinal = finalAssetsAfter[0] as { path: string } | undefined;
    if (!latestFinal) {
      throw new Error('Expected a final video asset after rerun');
    }
    const newFinalPath = latestFinal.path;
    expect(newFinalPath).not.toBe(initialFinalPath);

    const progressAfterRerun = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    expect(progressAfterRerun.every((row: any) => row.captionsDone && row.videoPartsDone && row.finalVideoDone)).toBe(true);

    const historyAfter = Array.from(prisma._db.projectStatusHistory.values()).filter((row: any) => row.projectId === projectId);
    expect(historyAfter.length).toBeGreaterThan(historyBeforeCount);
    const newEntries = historyAfter.slice(historyBeforeCount).map((row: any) => row.status);
    expect(newEntries).toContain(ProjectStatus.ProcessCaptionsVideo);
    expect(newEntries).toContain(ProjectStatus.ProcessVideoMain);
    expect(newEntries[newEntries.length - 1]).toBe(ProjectStatus.Done);
}, 45000);

  it('clears failures only for selected languages when languagesToReset is provided', async () => {
    const projectId = await createProject(['en', 'es']);
    const prisma = (globalThis as any).__vtPrisma;

    const failureState = {
      transcriptionDone: true,
      captionsDone: true,
      videoPartsDone: true,
      finalVideoDone: true,
      disabled: true,
      failedStep: 'video_parts',
      failureReason: 'Failed rendering',
    };
    await prisma.projectLanguageProgress.upsert({
      where: { projectId_languageCode: { projectId, languageCode: 'en' } },
      create: { projectId, languageCode: 'en', ...failureState },
      update: failureState,
    });
    await prisma.projectLanguageProgress.upsert({
      where: { projectId_languageCode: { projectId, languageCode: 'es' } },
      create: { projectId, languageCode: 'es', ...failureState },
      update: failureState,
    });
    const adminRes = await fetch(new URL(`/api/admin/projects/${projectId}/status`, app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'auth=test' },
      body: JSON.stringify({ status: ProjectStatus.ProcessVideoPartsGeneration, languagesToReset: ['es'] }),
    });
    expect(adminRes.ok).toBe(true);

    const rows = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
    const byLanguage = Object.fromEntries(rows.map((row: any) => [row.languageCode, row]));
    expect(byLanguage.es.disabled).toBe(false);
    expect(byLanguage.es.videoPartsDone).toBe(false);
    expect(byLanguage.es.failedStep).toBeNull();
    expect(byLanguage.en.disabled).toBe(true);
    expect(byLanguage.en.videoPartsDone).toBe(true);
    expect(byLanguage.en.failedStep).toBe('video_parts');
  });

  async function createProject(languages: string[] = ['en']): Promise<string> {
    const res = await fetch(new URL('/api/projects', app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'auth=test' },
      body: JSON.stringify({
        prompt: 'Reset pipeline demo',
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

  async function executeUntilDone(prisma: any, projectId: string, options: { runScript?: boolean } = {}) {
    const envPath = await makeDaemonEnv(`daemon-reset-${randomUUID()}.env`);
    await runWithExecutor(envPath, async ({ executeForProject }) => {
      if (options.runScript) {
        const scriptJob = findJob(prisma, projectId, 'script');
        if (scriptJob) {
          await executeForProject(projectId, ProjectStatus.ProcessScript, scriptJob.payload ?? {});
          scriptJob.status = 'done';
        }
      }
      let guard = 0;
      while (true) {
        const currentStatus = prisma._db.projects.get(projectId)?.status as ProjectStatus | undefined;
        if (!currentStatus || currentStatus === ProjectStatus.Done) break;
        guard += 1;
        expect(guard).toBeLessThan(60);
        await executeForProject(projectId, currentStatus, {});
      }
    });
  }

  function findJob(prismaInstance: any, projectId: string, type: string) {
    const jobs = Array.from(prismaInstance._db.jobs.values()) as any[];
    return jobs.find((job) => job.projectId === projectId && job.type === type) || null;
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
});
