import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../../scripts/publish-daemon/providers', () => ({
  getProvider: vi.fn(),
  getCleanupProvider: vi.fn(),
}));

import { runIteration } from '../../scripts/publish-daemon/runner';
import { SchedulerApiClient } from '../../scripts/publish-daemon/client';
import { getProvider, getCleanupProvider } from '../../scripts/publish-daemon/providers';
import { ProviderError } from '../../scripts/publish-daemon/providers/errors';

type MockClient = Pick<SchedulerApiClient, 'fetchTasks' | 'updateTask' | 'completeCleanup'>;

const baseTask = {
  id: 'task-1',
  userId: 'user-1',
  projectId: 'proj-1',
  languageCode: 'en',
  channelId: 'channel-1',
  platform: 'youtube',
  videoUrl: 'https://storage/video.mp4',
  publishAt: new Date().toISOString(),
  title: 'Title',
  description: null,
  status: 'pending',
  createdAt: new Date().toISOString(),
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

describe('publish daemon runner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('schedules tasks via provider and updates status', async () => {
    const providerImpl = vi.fn(async () => ({ providerTaskId: 'yt_task' }));
    (getProvider as unknown as Mock).mockReturnValue(providerImpl);
    const client: MockClient = {
      fetchTasks: vi.fn()
        .mockResolvedValueOnce({ tasks: [baseTask] })
        .mockResolvedValueOnce({ tasks: [] }),
      updateTask: vi.fn().mockResolvedValue({ updated: true }),
      completeCleanup: vi.fn().mockResolvedValue({ updated: true }),
    };

    const processed = await runIteration(client as SchedulerApiClient, 3);

    expect(processed).toBe(1);
    expect(client.fetchTasks).toHaveBeenNthCalledWith(1, 3, 'pending');
    expect(client.fetchTasks).toHaveBeenNthCalledWith(2, 3, 'cleanup');
    expect(providerImpl).toHaveBeenCalledWith(baseTask);
    expect(client.updateTask).toHaveBeenCalledWith('task-1', {
      status: 'scheduled',
      providerTaskId: 'yt_task',
    });
  });

  it('marks task as failed when provider throws', async () => {
    (getProvider as unknown as Mock).mockReturnValue(vi.fn(async () => { throw new Error('upload failed'); }));
    const client: MockClient = {
      fetchTasks: vi.fn()
        .mockResolvedValueOnce({ tasks: [baseTask] })
        .mockResolvedValueOnce({ tasks: [] }),
      updateTask: vi.fn().mockResolvedValue({ updated: true }),
      completeCleanup: vi.fn().mockResolvedValue({ updated: true }),
    };

    await runIteration(client as SchedulerApiClient, 1);

    expect(client.updateTask).toHaveBeenCalledWith('task-1', {
      status: 'failed',
      error: 'upload failed',
    });
  });

  it('marks task for retry with provider error metadata when retryable', async () => {
    (getProvider as unknown as Mock).mockReturnValue(vi.fn(async () => {
      throw new ProviderError('rate limited', {
        code: 'rate_limited',
        retryable: true,
        details: { stage: 'upload' },
      });
    }));
    const client: MockClient = {
      fetchTasks: vi.fn()
        .mockResolvedValueOnce({ tasks: [baseTask] })
        .mockResolvedValueOnce({ tasks: [] }),
      updateTask: vi.fn().mockResolvedValue({ updated: true }),
      completeCleanup: vi.fn().mockResolvedValue({ updated: true }),
    };

    await runIteration(client as SchedulerApiClient, 1);

    expect(client.updateTask).toHaveBeenCalledWith('task-1', {
      status: 'retry',
      error: 'rate limited',
      providerResponse: expect.objectContaining({
        errorCode: 'rate_limited',
        retryable: true,
        stage: 'upload',
      }),
    });
  });

  it('marks task for retry when scheduled update fails', async () => {
    const providerImpl = vi.fn(async () => ({ providerTaskId: 'yt_task' }));
    (getProvider as unknown as Mock).mockReturnValue(providerImpl);
    const client: MockClient = {
      fetchTasks: vi.fn()
        .mockResolvedValueOnce({ tasks: [baseTask] })
        .mockResolvedValueOnce({ tasks: [] }),
      updateTask: vi.fn()
        .mockImplementationOnce(() => Promise.reject(new Error('network')))
        .mockImplementationOnce(() => Promise.resolve({ updated: true })),
      completeCleanup: vi.fn().mockResolvedValue({ updated: true }),
    };

    await runIteration(client as SchedulerApiClient, 1);

    expect(providerImpl).toHaveBeenCalled();
    expect(client.updateTask).toHaveBeenNthCalledWith(1, 'task-1', {
      status: 'scheduled',
      providerTaskId: 'yt_task',
    });
    expect(client.updateTask).toHaveBeenNthCalledWith(2, 'task-1', {
      status: 'retry',
      error: expect.stringContaining('Scheduling update failed'),
    });
  });

  it('processes cleanup tasks via provider', async () => {
    const scheduleMock = vi.fn(async () => ({ providerTaskId: 'yt_task' }));
    const cleanupMock = vi.fn(async () => {});
    (getProvider as unknown as Mock).mockReturnValue(scheduleMock);
    (getCleanupProvider as unknown as Mock).mockReturnValue(cleanupMock);
    const cleanupTask = { ...baseTask, id: 'cleanup-1', providerTaskId: 'yt_cleanup', status: 'cleanup_pending' as const };
    const client: MockClient = {
      fetchTasks: vi.fn()
        .mockResolvedValueOnce({ tasks: [] })
        .mockResolvedValueOnce({ tasks: [cleanupTask] }),
      updateTask: vi.fn().mockResolvedValue({ updated: true }),
      completeCleanup: vi.fn().mockResolvedValue({ updated: true }),
    };

    const processed = await runIteration(client as SchedulerApiClient, 2);

    expect(processed).toBe(1);
    expect(cleanupMock).toHaveBeenCalledWith(cleanupTask);
    expect(client.completeCleanup).toHaveBeenCalledWith('cleanup-1', { status: 'done' });
  });
});
