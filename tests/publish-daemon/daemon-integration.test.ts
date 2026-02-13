import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { SchedulerApiClient } from '../../scripts/publish-daemon/client';
import { runIteration } from '../../scripts/publish-daemon/runner';

const providerHandler = vi.fn(async () => ({ providerTaskId: 'yt_task' }));

vi.mock('../../scripts/publish-daemon/providers', () => ({
  getProvider: () => providerHandler,
}));

const task = {
  id: 'task-integration',
  userId: 'user-1',
  projectId: 'project-1',
  languageCode: 'en',
  channelId: 'channel-1',
  platform: 'youtube',
  videoUrl: 'https://example.com/video.mp4',
  publishAt: '2025-11-19T00:00:00.000Z',
  title: 'Title',
  description: null,
  status: 'pending',
  createdAt: '2025-11-18T12:00:00.000Z',
  channel: {
    id: 'channel-1',
    provider: 'youtube',
    channelId: 'UC123',
    displayName: 'Test Channel',
    handle: '@test',
    refreshToken: 'refresh',
    accessToken: null,
    tokenExpiresAt: null,
    scopes: null,
    metadata: null,
  },
};

const fetchMock = vi.fn();

describe('publish daemon integration', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as any).fetch = fetchMock;
    providerHandler.mockClear();
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it('claims tasks via API client and updates status after provider schedules', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const target = url.toString();
      if (target.includes('/api/scheduler/tasks?')) {
        const statusParam = new URL(target).searchParams.get('status');
        if (statusParam === 'cleanup') {
          return Promise.resolve({ ok: true, json: async () => ({ tasks: [] }) });
        }
        expect(init?.method ?? 'GET').toBe('GET');
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [task] }),
        });
      }
      if (target.endsWith(`/api/scheduler/tasks/${task.id}`)) {
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-daemon-password']).toBe('secret');
        expect(headers['x-daemon-id']).toBe('publish-daemon-test');
        const body = JSON.parse(init?.body as string);
        expect(body).toEqual({ status: 'scheduled', providerTaskId: 'yt_task' });
        return Promise.resolve({ ok: true, json: async () => ({ updated: true }) });
      }
      throw new Error(`Unexpected URL ${target}`);
    });

    const client = new SchedulerApiClient({
      apiBaseUrl: 'https://dummy.yumcut.local',
      apiPassword: 'secret',
      daemonId: 'publish-daemon-test',
      pollIntervalMs: 1000,
      batchSize: 1,
      requestTimeoutMs: 2000,
      allowedMediaHosts: ['storage.test.local'],
    });

    const processed = await runIteration(client, 1);

    expect(processed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(providerHandler).toHaveBeenCalledWith(task);
  });
});
