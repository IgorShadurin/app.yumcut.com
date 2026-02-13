import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import path from 'path';
import { mkdir, rm, stat, readdir, readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { startAppApiServer, startStorageApiServer } from './helpers/app-server';
import { startDaemon, makeEnvFile, type DaemonProcess } from '../daemon/helpers/daemon';
import { buildDaemonEnvContent } from '../daemon/helpers/env';

async function waitFor(fn: () => boolean | Promise<boolean>, timeoutMs = 20000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(fn())) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

describe('Real handlers + virtual DB: full workflow', () => {
  let app: Awaited<ReturnType<typeof startAppApiServer>> | null = null;
  let storage: Awaited<ReturnType<typeof startStorageApiServer>> | null = null;
  let daemon: DaemonProcess | null = null;
  let workspaceRoot: string;
  let envFilePath: string;

  beforeEach(async () => {
    const wsName = `workspace-${randomUUID()}`;
    workspaceRoot = path.resolve('tests/daemon-and-api/workspaces', wsName);
    await mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    if (process.env.KEEP_DAEMON_WORKSPACE === '1') return;
    try { if (daemon) await daemon.stop(); } catch {}
    try { if (app) await app.close(); } catch {}
    try { if (storage) await storage.close(); } catch {}
    try { await rm(workspaceRoot, { recursive: true, force: true }); } catch {}
  });

  it('creates project via real handler and daemon completes the entire pipeline', async () => {
    // Provide DB url early to avoid config warnings during route import in mocked server
    process.env.DATABASE_URL = 'file:virtual';
    const mediaRoot = path.join(workspaceRoot, 'media');
    const daemonPassword = (() => {
      const val = process.env.DAEMON_API_PASSWORD;
      if (!val || val.trim().length === 0) throw new Error('DAEMON_API_PASSWORD must be set for this test');
      return val.trim();
    })();
    const daemonId = 'daemon-full-workflow';
    // Start storage on a randomized, pre-checked free port; its public URL defaults to its bound base.
    storage = await startStorageApiServer({ daemonPassword, mediaRoot });
    // App sees storage via explicit base URL to ensure absolute media URLs.
    app = await startAppApiServer({ daemonPassword, mediaRoot, storagePublicUrl: storage.baseUrl });

    // Create project (automatic mode) using real POST /api/projects
    const createRes = await fetch(new URL('/api/projects', app.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Make a cool video',
        durationSeconds: 30,
        characterSelection: { source: 'dynamic' },
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text().catch(()=>'<no-body>');
      throw new Error(`create project failed: ${createRes.status} ${text}`);
    }
    const created = await createRes.json();
    const projectId = created.id as string;
    expect(typeof projectId).toBe('string');

    // Daemon env
    const envContent = buildDaemonEnvContent({
      apiBaseUrl: app.baseUrl,
      storageBaseUrl: storage.baseUrl,
      password: daemonPassword,
      projectsWorkspace: workspaceRoot,
      overrides: {
        intervalMs: 80,
        taskTimeoutSeconds: 30,
        requestTimeoutMs: 2000,
        logsSilent: '0',
      },
      extra: {
        DATABASE_URL: 'file:virtual',
        MEDIA_ROOT: mediaRoot,
        STORAGE_PUBLIC_URL: storage.baseUrl,
        NEXTAUTH_URL: app.baseUrl,
        NODE_ENV: 'production',
      },
    });
    envFilePath = makeEnvFile(path.join(workspaceRoot, '.tmp'), envContent);

    // Start daemon with deterministic outputs
    daemon = startDaemon(envFilePath, { YUMCUT_DUMMY_TEXT: 'REAL_FW_TEXT', YUMCUT_DUMMY_RUN_ID: 'REAL' });

    // Health calls
    expect(await waitFor(() => app!.calls.some(c => c.path === '/api/daemon/health'))).toBe(true);
    let storageOk = false;
    try {
      const r = await fetch(new URL('/api/storage/health', storage!.baseUrl), {
        headers: { 'x-daemon-password': daemonPassword, 'x-daemon-id': daemonId },
      });
      storageOk = r.ok;
    } catch { storageOk = false; }
    expect(storageOk).toBe(true);

    // Ensure scheduler is polling eligible and queue
    expect(await waitFor(() => app!.calls.some(c => c.path === '/api/daemon/projects/eligible'))).toBe(true);
    // ensure exists/creation path is exercised
    expect(await waitFor(() => app!.calls.some(c => c.path === '/api/daemon/jobs/exists'))).toBe(true);
    expect(await waitFor(() => app!.calls.some(c => c.path === '/api/daemon/jobs/queue'))).toBe(true);

    // Script stored via real handler
    const scriptReady = await waitFor(async () => {
      const r = await fetch(new URL(`/api/daemon/projects/${projectId}/script`, app!.baseUrl), {
        method: 'GET',
        headers: { 'x-daemon-password': daemonPassword, 'x-daemon-id': daemonId },
      });
      if (!r.ok) return false;
      const j = await r.json();
      return typeof j.text === 'string' && j.text.length > 0;
    }, 15000);
    expect(scriptReady).toBe(true);

    // Ensure the script job was released (marked done) – protects against stalls caused by a lingering running job.
    const scriptJobReleased = await waitFor(() => app!.state.jobStatuses.some((s) => s.projectId === projectId && s.status === 'done'), 10000);
    expect(scriptJobReleased).toBe(true);

    // Validate end-to-end status progression observed by real handlers
    const expected = [
      'process_script',
      'process_audio',
      'process_transcription',
      'process_metadata',
      'process_captions_video',
      'process_images_generation',
      'process_video_parts_generation',
      'process_video_main',
      'done',
    ];
    const sawAllStatuses = await waitFor(() => {
      const seen = app!.state.statuses.filter(s => s.projectId === projectId).map(s => s.status);
      // Compress consecutive duplicates (some steps may set status twice with different messages)
      const compressed: string[] = [];
      for (const s of seen) { if (compressed.length === 0 || compressed[compressed.length-1] !== s) compressed.push(s); }
      // If we hit error after all expected steps, accept (final video path still checked below)
      const filtered = compressed.filter((s) => s !== 'error');
      let i = 0;
      for (const s of filtered) {
        if (s === expected[i]) i += 1;
        if (i === expected.length) return true;
      }
      return false;
    }, 60000);
    if (!sawAllStatuses) {
      const snap = app!.state.statuses.filter(s => s.projectId === projectId);
      const snapshot = snap.map(s => s.status);
      // eslint-disable-next-line no-console
      console.log('Observed statuses:', snapshot);
      console.log('Last status detail:', snap[snap.length - 1]);
      // eslint-disable-next-line no-console
      console.log('Daemon stdout:', daemon?.stdout || '');
      // eslint-disable-next-line no-console
      console.log('Daemon stderr:', daemon?.stderr || '');
      console.log('Captured app.state.assets:', app!.state.assets);
      console.log('Storage calls:', storage!.calls);
      const hasRegister = app!.calls.some(c => /\/api\/daemon\/projects\/.+\/assets$/.test(c.path));
      console.log('App calls contain assets register:', hasRegister);
    }
    expect(sawAllStatuses).toBe(true);

    // Storage received uploads: at least one audio and the final video
    const uploadsOk = await waitFor(() => (
      app!.state.assets.filter(a => a.projectId === projectId && (a.kind === 'audio' || a.kind === 'video')).length >= 2
    ), 30000);
    expect(uploadsOk).toBe(true);
    const assetKinds = app!.state.assets.filter(a => a.projectId === projectId).map(a => `${a.kind}:${a.isFinal ? 'final' : 'temp'}`);
    expect(assetKinds.some(k => k.startsWith('audio:'))).toBe(true);
    expect(assetKinds.includes('video:final')).toBe(true);

    // Ensure dummy final video exists (merge-layers output)
    const finalDir = path.join(workspaceRoot, projectId, 'workspace', 'en', 'video-merge-layers');
    const candidates = [
      'final.1080p.mp4',
      'final.1080p.watermarked.mp4',
      'final.1080p.captions.mp4',
      'final.1080p.captions-watermarked.mp4',
    ];
    const finalExists = await waitFor(async () => {
      for (const name of candidates) {
        const fullPath = path.join(finalDir, name);
        try { await stat(fullPath); return true; } catch {}
      }
      return false;
    }, 10000);
    expect(finalExists).toBe(true);

    // Final public status must be Done with a URL
    const doneOk = await waitFor(async () => {
      const res = await fetch(new URL(`/api/projects/${projectId}/status`, app!.baseUrl), { headers: { cookie: 'auth=test' } });
      if (!res.ok) return false;
      const j = await res.json();
      const status = typeof j.status === 'string' ? j.status.toLowerCase() : '';
      return status === 'done' && typeof j.statusInfo?.url === 'string' && j.statusInfo.url.length > 0;
    }, 30000);
    if (!doneOk) {
      const res = await fetch(new URL(`/api/projects/${projectId}/status`, app!.baseUrl), { headers: { cookie: 'auth=test' } });
      const j = await res.json();
      console.log('Final status payload:', j);
      console.log('Statuses captured:', app!.state.statuses.filter(s => s.projectId === projectId));
      console.log('Assets captured:', app!.state.assets.filter(a => a.projectId === projectId));
    }
    expect(doneOk).toBe(true);

    // Fetch project detail to ensure generated character is linked
    const projectDetailRes = await fetch(new URL(`/api/projects/${projectId}`, app!.baseUrl), {
      headers: { cookie: 'auth=test' },
    });
    if (!projectDetailRes.ok) {
      const text = await projectDetailRes.text().catch(() => '<no-body>');
      throw new Error(`project detail failed: ${projectDetailRes.status} ${text}`);
    }
    const projectDetail = await projectDetailRes.json();
    const creation = projectDetail?.creation || {};
    expect(typeof creation?.characterSelection).toBe('object');
    if (creation?.characterSelection?.imageUrl) {
      expect(typeof creation.characterSelection.imageUrl).toBe('string');
      expect((creation.characterSelection.imageUrl || '').length).toBeGreaterThan(0);
    }

    // Verify image generator invoked with --new-character
    const imagesLogDir = path.join(workspaceRoot, projectId, 'logs', 'en', 'images');
    const logs = await readdir(imagesLogDir);
    const logPath = path.join(imagesLogDir, logs[logs.length - 1]);
    const logContent = await readFile(logPath, 'utf8');
    expect(logContent).toContain('--new-character');
    expect(logContent).not.toContain('--character-image=');
  }, 120000);
});
