import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import { rm, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { startFakeApiServer, startFakeStorageServer, type ApiServer, type StorageServer } from './helpers/fake-servers';
import { makeEnvFile, startDaemon, type DaemonProcess } from './helpers/daemon';
import { buildDaemonEnvContent } from './helpers/env';

async function waitFor(predicate: () => boolean, timeoutMs = 4000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

describe('daemon basic', () => {
  const password = 'secret';
  const TEST_DAEMON_ID = 'daemon-basic-tests';
  let api: ApiServer;
  let storage: StorageServer;
  let daemon: DaemonProcess | null = null;
  let workspaceRoot: string;
  let envFilePath: string;

  beforeEach(async () => {
    api = await startFakeApiServer({ password });
    storage = await startFakeStorageServer();
    const wsName = `workspace-${randomUUID()}`;
    workspaceRoot = path.resolve('tests/daemon/workspaces', wsName);
    await mkdir(workspaceRoot, { recursive: true });
    const envContent = buildDaemonEnvContent({
      apiBaseUrl: api.baseUrl,
      storageBaseUrl: storage.baseUrl,
      password: 'secret',
      projectsWorkspace: workspaceRoot,
      overrides: {
        taskTimeoutSeconds: 10,
        requestTimeoutMs: 500,
        logsSilent: '0',
      },
    });
    envFilePath = makeEnvFile(path.join(workspaceRoot, '.tmp'), envContent);
  });

  afterEach(async () => {
    try { if (daemon) await daemon.stop(); } catch {}
    try { await api.close(); } catch {}
    try { await storage.close(); } catch {}
    try { await rm(workspaceRoot, { recursive: true, force: true }); } catch {}
  });

  it('starts and passes health checks with fake servers', async () => {
    daemon = startDaemon(envFilePath);
    const pwd = password;
    const ok = await waitFor(() => {
      const apiOk = api.calls.some((call) => call.path === '/api/daemon/health');
      let storageOk = false;
      try {
        // Synchronous wrapper because waitFor expects sync fn
        // @ts-ignore
        const r = fetch(new URL('/api/storage/health', storage.baseUrl), {
          headers: { 'x-daemon-password': pwd, 'x-daemon-id': TEST_DAEMON_ID },
        });
        // Promise won't resolve synchronously; mark optimistic fallback
        // We will re-evaluate on next tick via waitFor loop.
      } catch {}
      try {
        // best-effort: check last call history
        storageOk = storage.calls.some((c) => c.path === '/api/storage/health');
      } catch {}
      return apiOk && storageOk;
    }, 8000);
    if (!ok) {
      console.error('Daemon stdout (health check)', daemon?.stdout || '<empty>');
      console.error('Daemon stderr (health check)', daemon?.stderr || '<empty>');
    }
    expect(ok).toBe(true);
  }, 10000);

  it('claims a script job and writes initial script archive', async () => {
    const projectId = `p_${randomUUID()}`;
    const prompt = 'Hello from test prompt';
    // Seed API with a queued script job
    api.state.projects.push({ id: projectId, status: 'ProcessScript', userId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    api.state.jobs.push({ id: `job_${Date.now()}`, projectId, type: 'script', status: 'queued', createdAt: new Date().toISOString(), payload: { prompt } });

    const forced = 'EXPECTED_TEXT_FROM_ENV';
    daemon = startDaemon(envFilePath, { YUMCUT_DUMMY_TEXT: forced });

    // Wait until API received script upsert
    const ok = await waitFor(() => typeof api.state.scripts[projectId] === 'string' && api.state.scripts[projectId].length > 0, 15000);
    if (!ok) {
      console.error('Daemon stdout (script claim)', daemon?.stdout || '<empty>');
      console.error('Daemon stderr (script claim)', daemon?.stderr || '<empty>');
    }
    expect(ok).toBe(true);

    // Verify the archive file exists with expected content
    const dir = path.join(workspaceRoot, projectId, 'workspace', 'en', 'scripts');
    const archivePath = path.join(dir, 'initial-script.txt');
    // The archive файл может появиться с временной меткой; проверяем директорию
    const entries = await (await import('fs/promises')).readdir(dir);
    const initialFile = entries.find((f) => f.startsWith('initial-script'))!;
    const content = await (await import('fs/promises')).readFile(path.join(dir, initialFile), 'utf8');
    expect(content).toMatch(/Output:/);
    expect(content).toContain(forced);
  }, 20000);

  it('refines an existing script without passing unsupported CLI flags', async () => {
    const projectId = `p_${randomUUID()}`;
    api.state.projects.push({ id: projectId, status: 'ProcessScript', userId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    api.state.scripts[projectId] = 'Existing script body for refinement.';
    const jobId = `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    api.state.jobs.push({
      id: jobId,
      projectId,
      type: 'script',
      status: 'queued',
      createdAt: new Date().toISOString(),
      payload: {
        reason: 'script_refinement',
        requestText: 'Please shorten and clarify the English narration.',
        languageCode: 'en',
        languages: ['en'],
        refinePropagateTranslations: false,
      },
    });

    daemon = startDaemon(envFilePath);

    const refined = await waitFor(
      () => typeof api.state.scripts[projectId] === 'string' && api.state.scripts[projectId].startsWith('REFINED('),
      10000,
    );
    if (!refined) {
      console.error('Daemon stdout (refine)', daemon?.stdout || '<empty>');
      console.error('Daemon stderr (refine)', daemon?.stderr || '<empty>');
    }
    expect(refined).toBe(true);
  }, 15000);

  it('runs two daemons concurrently without conflicts and isolates outputs', async () => {
    const p1 = `p_${randomUUID()}`;
    const p2 = `p_${randomUUID()}`;
    const j1 = { id: `job_${Date.now()}_1`, projectId: p1, type: 'script', status: 'queued', createdAt: new Date().toISOString(), payload: { prompt: 'P1' } };
    const j2 = { id: `job_${Date.now()}_2`, projectId: p2, type: 'script', status: 'queued', createdAt: new Date().toISOString(), payload: { prompt: 'P2' } };
    api.state.projects.push(
      { id: p1, status: 'ProcessScript', userId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: p2, status: 'ProcessScript', userId: 'u1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    );
    api.state.jobs.push(j1, j2);

    const d1 = startDaemon(envFilePath, {
      YUMCUT_DUMMY_RUN_ID: 'A',
      YUMCUT_DUMMY_TEXT: 'TEXT_A',
      DAEMON_INSTANCE_ID: 'daemon-basic-A',
    });
    const d2 = startDaemon(envFilePath, {
      YUMCUT_DUMMY_RUN_ID: 'B',
      YUMCUT_DUMMY_TEXT: 'TEXT_B',
      DAEMON_INSTANCE_ID: 'daemon-basic-B',
    });

    // Wait for both projects to have scripts
    const both = await waitFor(() =>
      typeof api.state.scripts[p1] === 'string' && api.state.scripts[p1].length > 0 &&
      typeof api.state.scripts[p2] === 'string' && api.state.scripts[p2].length > 0,
      10000
    );
    expect(both).toBe(true);

    const fs = await import('fs/promises');
    const dir1 = path.join(workspaceRoot, p1, 'workspace', 'en', 'scripts');
    const dir2 = path.join(workspaceRoot, p2, 'workspace', 'en', 'scripts');
    const f1 = (await fs.readdir(dir1)).find((f) => f.startsWith('initial-script'))!;
    const f2 = (await fs.readdir(dir2)).find((f) => f.startsWith('initial-script'))!;
    const c1 = await fs.readFile(path.join(dir1, f1), 'utf8');
    const c2 = await fs.readFile(path.join(dir2, f2), 'utf8');
    const hits = [c1, c2].map((c) => (c.includes('TEXT_A') ? 'A' : c.includes('TEXT_B') ? 'B' : '?'));
    // We expect exactly one A and one B across both outputs regardless of which daemon picked which job.
    hits.sort();
    expect(hits).toEqual(['A', 'B']);

    await d1.stop();
    await d2.stop();
  }, 15000);
});
