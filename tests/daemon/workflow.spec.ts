import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import path from 'path';
import { mkdir, rm, stat, readFile, readdir, access } from 'fs/promises';
import { randomUUID } from 'crypto';
import { startFakeApiServer, startFakeStorageServer, type ApiServer, type StorageServer } from './helpers/fake-servers';
import { makeEnvFile, startDaemon, type DaemonProcess } from './helpers/daemon';
import { buildDaemonEnvContent } from './helpers/env';

async function waitFor(fn: () => boolean | Promise<boolean>, timeoutMs = 12000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(fn())) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

describe('daemon full workflow', () => {
  let api: ApiServer;
  let storage: StorageServer;
  let daemon: DaemonProcess | null = null;
  let workspaceRoot: string;
  let envFilePath: string;
  const W_TEXT = 'WFLOW_TEXT_12345';

  beforeEach(async () => {
    api = await startFakeApiServer({ password: 'secret' });
    storage = await startFakeStorageServer();
    const wsName = `workspace-${randomUUID()}`;
    workspaceRoot = path.resolve('tests/daemon/workspaces', wsName);
    await mkdir(workspaceRoot, { recursive: true });

    // Override creation snapshot to enable captions branch
    api.set('GET /api/daemon/projects/:id/creation-snapshot', async (_req, res, _url, _body) => {
      const payload = {
        autoApproveScript: true,
        autoApproveAudio: true,
        useExactTextAsScript: false,
        durationSeconds: 8,
        targetLanguage: 'en',
        languages: ['en'],
        watermarkEnabled: true,
        captionsEnabled: true,
        scriptCreationGuidanceEnable: false,
        scriptCreationGuidance: '',
        scriptAvoidanceGuidanceEnabled: false,
        scriptAvoidanceGuidance: '',
        audioStyleGuidanceEnabled: false,
        audioStyleGuidance: '',
        characterSelection: null,
        voiceId: 'inworld-workflow-voice',
        voiceProviders: {
          'inworld-workflow-voice': 'inworld',
        },
        voiceAssignments: {
          en: {
            voiceId: 'inworld-workflow-voice',
            templateVoiceId: 'tpl-inworld-voice',
            title: 'Inworld Workflow Voice',
            speed: 'fast',
            gender: 'female',
            voiceProvider: 'inworld',
            source: 'project',
          },
        },
        template: {
          id: 'tpl_basic',
          code: 'basic',
          artStyle: {
            id: 'tpl_art_basic',
            title: 'Basic Cartoon',
            description: 'Workflow test art style',
            prompt: 'Workflow test art style prompt',
            referenceImageUrl: null,
          },
          captionsStyle: {
            id: 'tpl_captions_acid',
            title: 'Acid',
            description: 'Workflow test captions style',
            externalId: 'acid',
          },
        },
      };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
    });

    const envContent = buildDaemonEnvContent({
      apiBaseUrl: api.baseUrl,
      storageBaseUrl: storage.baseUrl,
      password: 'secret',
      projectsWorkspace: workspaceRoot,
      overrides: {
        taskTimeoutSeconds: 15,
        requestTimeoutMs: 500,
        logsSilent: '0',
      },
    });
    envFilePath = makeEnvFile(path.join(workspaceRoot, '.tmp'), envContent);
  });

  afterEach(async () => {
    if (process.env.KEEP_DAEMON_WORKSPACE === '1') return;
    try { if (daemon) await daemon.stop(); } catch {}
    try { await api.close(); } catch {}
    try { await storage.close(); } catch {}
    try { await rm(workspaceRoot, { recursive: true, force: true }); } catch {}
  });

it('processes a project end-to-end, releasing jobs after 5 queue pings', async () => {
    const projectId = `p_${randomUUID()}`;
    api.state.projects.push({ id: projectId, status: 'ProcessScript', userId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    // Controlled queue: release script immediately, then each next step after exactly 5 queue polls
    const steps = ['script','audio','transcription','metadata','captions_video','images','video_parts','video_main'] as const;
    let queueCalls = 0;
    let idx = 0;
    const makeJob = (type: (typeof steps)[number]) => ({
      id: `job_${type}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      projectId,
      type,
      status: 'queued',
      createdAt: new Date().toISOString(),
      payload: type === 'script' ? { prompt: 'From Workflow Test' } : undefined,
    });

    api.set('GET /api/daemon/jobs/queue', async (_req, res, url, _body) => {
      queueCalls += 1;
      // allow daemon's "limit" param but we provide at most one
      const limit = Number(url.searchParams.get('limit') || '1');
      const jobs: any[] = [];
      if (idx === 0) {
        // first ping yields the initial script job
        const j = makeJob('script');
        api.state.jobs.push(j);
        jobs.push(j);
        idx += 1;
      } else if (idx < steps.length) {
        // release next job only on every 5th ping since the last release
        if (queueCalls % 5 === 0) {
          const j = makeJob(steps[idx]);
          api.state.jobs.push(j);
          jobs.push(j);
          idx += 1;
        }
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jobs: jobs.slice(0, limit) }));
    });

    // Expose eligible as empty to avoid ensureJobsForProjects auto-enqueuing
    api.set('GET /api/daemon/projects/eligible', async (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ projects: [] }));
    });

    daemon = startDaemon(envFilePath, { YUMCUT_DUMMY_TEXT: W_TEXT, YUMCUT_DUMMY_RUN_ID: 'WFLOW' });

    // 1) Script phase completes (script stored and status advanced)
    const scriptStored = await waitFor(() => typeof api.state.scripts[projectId] === 'string' && api.state.scripts[projectId].includes(W_TEXT));
    expect(scriptStored).toBe(true);
    const scriptArchiveDir = path.join(workspaceRoot, projectId, 'workspace', 'en', 'scripts');
    const scriptFiles = await readdir(scriptArchiveDir);
    expect(scriptFiles.some((n) => n.startsWith('initial-script'))).toBe(true);

    // 2) Audio phase (after 5 pings) uploads audio and registers asset
    const audioRegistered = await waitFor(() => api.state.assets.some((a) => a.projectId === projectId && a.kind === 'audio'));
    expect(audioRegistered).toBe(true);
    const audioAsset = api.state.assets.find((a) => a.projectId === projectId && a.kind === 'audio')!;
    expect(typeof audioAsset.url).toBe('string');
    // local wav file exists
    expect(audioAsset.localPath && (await stat(audioAsset.localPath)).isFile()).toBe(true);

    // 3) Metadata phase writes JSON (implies transcription completed)
    const metadataJson = path.join(workspaceRoot, projectId, 'workspace', 'en', 'metadata', 'transcript-blocks.json');
    const hasJson = await waitFor(() => stat(metadataJson).then(() => true).catch(() => false));
    expect(hasJson).toBe(true);
    // Now confirm transcription logs exist (indirectly proving agent ran)
    const transLogDir = path.join(workspaceRoot, projectId, 'logs', 'en', 'transcription');
    const hasTransLog = await waitFor(() => readdir(transLogDir).then((l) => l.length > 0).catch(() => false));
    expect(hasTransLog).toBe(true);

    // 5) Captions overlay exists
    const captionsOut = path.join(workspaceRoot, projectId, 'workspace', 'en', 'captions-video', 'out-alpha-validated.webm');
    const hasCaptions = await waitFor(() => access(captionsOut).then(() => true).catch(() => false));
    expect(hasCaptions).toBe(true);

    // 6) Images phase logs exist
    const imagesLogDir = path.join(workspaceRoot, projectId, 'logs', 'en', 'images');
    const imagesLogReady = await waitFor(() => readdir(imagesLogDir).then((l) => l.length > 0).catch(() => false));
    expect(imagesLogReady).toBe(true);
    const stylePromptPath = path.join(workspaceRoot, projectId, 'workspace', 'en', 'prompts', 'image-style.txt');
    const hasStylePrompt = await waitFor(() => stat(stylePromptPath).then(() => true).catch(() => false));
    expect(hasStylePrompt).toBe(true);
    const stylePromptContent = await readFile(stylePromptPath, 'utf8');
    expect(stylePromptContent.trim()).toBe('Workflow test art style prompt');

    // 7) Video parts should populate dummy main video
    const mainVideoPath = path.join(workspaceRoot, projectId, 'workspace', 'en', 'video-basic-effects', 'final', 'simple.1080p.mp4');
    const partsRendered = await waitFor(() => stat(mainVideoPath).then(() => true).catch(() => false));
    expect(partsRendered).toBe(true);

    // 8) Video main uploads final video and registers asset
    const videoRegistered = await waitFor(() => api.state.assets.some((a) => a.projectId === projectId && a.kind === 'video' && a.isFinal === true));
    expect(videoRegistered).toBe(true);
    const videoAsset = api.state.assets.find((a) => a.projectId === projectId && a.kind === 'video')!;
    expect(videoAsset.isFinal).toBe(true);
    expect(videoAsset.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/media\//);
    // Also verify storage saw a video upload with isFinal flag
    const uploadedFinal = storage.state.uploads.some((u) => u.projectId === projectId && u.type === 'video');
    expect(uploadedFinal).toBe(true);
  }, 60000);
});
