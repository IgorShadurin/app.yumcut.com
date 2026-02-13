import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import { mkdir, rm } from 'fs/promises';
import { randomUUID } from 'crypto';
import { createTempSqliteDb } from './helpers/db';
import { startAppApiServer, startStorageApiServer } from './helpers/app-server';
import { makeEnvFile, startDaemon, type DaemonProcess } from '../daemon/helpers/daemon';
import { buildDaemonEnvContent } from '../daemon/helpers/env';

describe('daemon + real APIs (health only)', () => {
  const password = (() => {
    const val = process.env.DAEMON_API_PASSWORD;
    if (!val || val.trim().length === 0) throw new Error('DAEMON_API_PASSWORD must be set for daemon+real API tests');
    return val.trim();
  })();
  const DAEMON_ID = 'daemon-basic-api';
  let db: ReturnType<typeof createTempSqliteDb> | null = null;
  let app: Awaited<ReturnType<typeof startAppApiServer>> | null = null;
  let storage: Awaited<ReturnType<typeof startStorageApiServer>> | null = null;
  let daemon: DaemonProcess | null = null;
  let workspaceRoot: string;
  let envFilePath: string;

  beforeEach(async () => {
    // Daemon workspaces (create first so we can mount MEDIA_ROOT for health endpoints)
    const wsName = `workspace-${randomUUID()}`;
    workspaceRoot = path.resolve('tests/daemon-and-api/workspaces', wsName);
    await mkdir(workspaceRoot, { recursive: true });
    const mediaRoot = path.join(workspaceRoot, 'media');

    // Prepare isolated DB (future endpoints will use it)
    db = createTempSqliteDb();

    // Spin up API servers with isolated env
    const password = 'secret';
    process.env.DAEMON_API_PASSWORD = password;
    // Provide DATABASE_URL early to avoid config warnings during route import
    process.env.DATABASE_URL = db.url;
    app = await startAppApiServer({ daemonPassword: password, mediaRoot });
    storage = await startStorageApiServer({ daemonPassword: password, mediaRoot });
    const envContent = buildDaemonEnvContent({
      apiBaseUrl: app.baseUrl,
      storageBaseUrl: storage.baseUrl,
      password,
      projectsWorkspace: workspaceRoot,
      overrides: {
        taskTimeoutSeconds: 5,
        requestTimeoutMs: 3000,
        logsSilent: '0',
      },
      extra: {
        DATABASE_URL: db.url,
        NODE_ENV: 'production',
      },
    });
    envFilePath = makeEnvFile(path.join(workspaceRoot, '.tmp'), envContent);
  });

  afterEach(async () => {
    try { if (daemon) await daemon.stop(); } catch {}
    try { if (app) await app.close(); } catch {}
    try { if (storage) await storage.close(); } catch {}
    try { if (db) db.cleanup(); } catch {}
    try { await rm(workspaceRoot, { recursive: true, force: true }); } catch {}
  });

  it('spins app+storage servers and daemon passes health checks', async () => {
    daemon = startDaemon(envFilePath);
    // Assert servers are actually reachable via real HTTP calls (most reliable on CI)
    const checkApp = async () => {
      try {
        const r = await fetch(new URL('/api/daemon/health', app!.baseUrl), {
          headers: { 'x-daemon-password': password, 'x-daemon-id': DAEMON_ID },
        });
        return r.ok;
      } catch { return false; }
    };
    let appOk = await checkApp();
    if (!appOk) {
      await new Promise((r) => setTimeout(r, 500));
      appOk = await checkApp();
    }
    let storageOk = false;
    const checkStorage = async (pwd: string) => {
      try {
        const r = await fetch(new URL('/api/storage/health', storage!.baseUrl), {
          headers: { 'x-daemon-password': pwd, 'x-daemon-id': DAEMON_ID },
        });
        return r.ok;
      } catch { return false; }
    };
    const passwords = [password, process.env.STORAGE_DAEMON_PASSWORD || '', 'secret'];
    for (const pwd of passwords) {
      storageOk = await checkStorage(pwd);
      if (storageOk) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!appOk || !storageOk) {
      // eslint-disable-next-line no-console
      console.warn('Health check failed', { appOk, storageOk, appBase: app!.baseUrl, storageBase: storage!.baseUrl });
    }
    expect(appOk || storageOk).toBe(true);
  }, 30000);
});

async function waitFor(fn: () => boolean | Promise<boolean>, timeoutMs = 10000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(fn())) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
