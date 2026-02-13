import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadPublishDaemonConfig, __resetPublishDaemonConfigForTests } from '../../scripts/publish-daemon/config';

function restoreEnv(snapshot: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value!;
  }
}

describe('publish daemon config security', () => {
  let envBackup: NodeJS.ProcessEnv;

  beforeEach(() => {
    envBackup = { ...process.env };
    process.env.PUBLISH_DAEMON_API_BASE_URL = 'https://example.com';
    process.env.DAEMON_API_PASSWORD = 'test-secret';
    process.env.PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS = 'storage.example.com';
    delete process.env.PUBLISH_DAEMON_ENV_FILE;
    __resetPublishDaemonConfigForTests();
  });

  afterEach(() => {
    restoreEnv(envBackup);
    __resetPublishDaemonConfigForTests();
  });

  it('rejects insecure remote API base URLs', () => {
    process.env.PUBLISH_DAEMON_API_BASE_URL = 'http://api.example.com';
    expect(() => loadPublishDaemonConfig()).toThrow(/https/i);
  });

  it('allows localhost over http for development', () => {
    process.env.PUBLISH_DAEMON_API_BASE_URL = 'http://localhost:4000';
    const cfg = loadPublishDaemonConfig();
    expect(cfg.apiBaseUrl).toBe('http://localhost:4000/');
  });

  it('parses media host allowlist and normalizes casing', () => {
    process.env.PUBLISH_DAEMON_ALLOWED_MEDIA_HOSTS = 'storage.example.com,Media.YumCut.com';
    const cfg = loadPublishDaemonConfig();
    expect(cfg.allowedMediaHosts).toEqual(['storage.example.com', 'media.yumcut.com']);
  });
});
