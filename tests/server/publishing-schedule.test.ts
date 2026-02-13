import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

type MockTask = {
  id: string;
  userId: string;
  channelId: string;
  languageCode: string;
  status: string;
  publishAt: Date;
  createdAt: Date;
  channel: {
    id: string;
    provider: string;
    channelId: string;
    displayName: string | null;
    handle: string | null;
    refreshToken: string | null;
    accessToken: string | null;
  };
};

const mockState = { tasks: [] as MockTask[] };

vi.mock('@/server/db', () => {
  const STATUS_BLOCKING = new Set(['pending', 'retry', 'processing', 'scheduled'] as const);

  const prismaStub = {
    publishTask: {
      findFirst: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        // Conflict lookup: exact publishAt + channel + blocking status
        if (where.publishAt) {
          return (
            mockState.tasks.find(
              (task) =>
                task.channelId === where.channelId
                && task.publishAt.getTime() === (where.publishAt as Date).getTime()
                && STATUS_BLOCKING.has(task.status as any),
            ) || null
          );
        }

        const statusFilter = where.status?.in ? new Set<string>(where.status.in) : null;
        const candidates = mockState.tasks
          .filter((task) =>
            task.userId === where.userId
            && task.channelId === where.channelId
            && task.languageCode === where.languageCode
            && (!statusFilter || statusFilter.has(task.status)),
          )
          .sort((a, b) => b.publishAt.getTime() - a.publishAt.getTime());
        return candidates.length > 0 ? candidates[0] : null;
      }),
      findMany: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        let statusFilter: Set<string> | null = null;
        if (typeof where.status === 'string') {
          statusFilter = new Set([where.status]);
        } else if (where.status?.in) {
          statusFilter = new Set(where.status.in as string[]);
        }
        return mockState.tasks.filter((task) => {
          if (statusFilter && !statusFilter.has(task.status)) return false;
          if (where.OR && Array.isArray(where.OR)) {
            const orMatch = where.OR.some((branch: any) => {
              if (branch.createdAt?.lte) {
                return task.createdAt.getTime() <= new Date(branch.createdAt.lte).getTime();
              }
              if (branch.publishAt?.lte) {
                return task.publishAt.getTime() <= new Date(branch.publishAt.lte).getTime();
              }
              return false;
            });
            if (!orMatch) return false;
          }
          return true;
        }).map((task) => ({
          ...task,
          channel: task.channel,
        }));
      }),
      updateMany: vi.fn(async (args: any) => {
        const ids: string[] = args?.where?.id?.in ?? [];
        const nextStatus = args?.data?.status;
        mockState.tasks = mockState.tasks.map((task) =>
          ids.includes(task.id) ? { ...task, status: nextStatus ?? task.status } : task,
        );
        return { count: ids.length };
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(prismaStub)),
  };

  return { prisma: prismaStub };
});

import { prisma } from '@/server/db';
import { computeNextPublishAt } from '@/server/publishing/schedule';
import {
  claimPublishTasks,
  claimCleanupTasks,
  PUBLISH_TASK_CANCEL_WINDOW_MS,
  PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS,
} from '@/server/publishing/tasks';

const publishTaskMock = prisma.publishTask as any;

function setMockTasks(tasks: Array<{ id?: string; userId: string; channelId: string; languageCode: string; status: string; publishAt: string; createdAt?: string }>) {
  mockState.tasks = tasks.map((task, index) => ({
    id: task.id ?? `task_${index}`,
    ...task,
    publishAt: new Date(task.publishAt),
    createdAt: new Date(task.createdAt ?? task.publishAt),
    channel: {
      id: task.channelId,
      provider: 'youtube',
      channelId: task.channelId,
      displayName: null,
      handle: null,
      refreshToken: 'plain-token',
      accessToken: null,
    },
  }));
}

describe('computeNextPublishAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-18T12:00:00.000Z'));
    setMockTasks([]);
    publishTaskMock.findFirst.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives next slot from completed history entries', async () => {
    setMockTasks([
      {
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'completed',
        publishAt: '2025-11-15T09:00:00.000Z',
      },
    ]);

    const next = await computeNextPublishAt({
      userId: 'user-1',
      channelId: 'channel-1',
      languageCode: 'en',
      baseTime: '09:00',
      cadenceDays: 3,
    });

    expect(next.toISOString()).toBe('2025-11-21T09:00:00.000Z');
  });

  it('skips conflicting pending slots when computing next publishAt', async () => {
    setMockTasks([
      {
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'completed',
        publishAt: '2025-11-15T09:00:00.000Z',
      },
      {
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'pending',
        publishAt: '2025-11-21T09:00:00.000Z',
      },
    ]);

    const next = await computeNextPublishAt({
      userId: 'user-1',
      channelId: 'channel-1',
      languageCode: 'en',
      baseTime: '09:00',
      cadenceDays: 3,
    });

    expect(next.toISOString()).toBe('2025-11-24T09:00:00.000Z');
  });
});

describe('claimPublishTasks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-18T12:00:00.000Z'));
    setMockTasks([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips tasks that are still cancelable', async () => {
    const now = new Date();
    setMockTasks([
      {
        id: 'keep-pending',
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'pending',
        publishAt: new Date(now.getTime() + PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS + 3600000).toISOString(),
        createdAt: new Date(now.getTime() - (PUBLISH_TASK_CANCEL_WINDOW_MS / 2)).toISOString(),
      },
      {
        id: 'claim-older',
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'pending',
        publishAt: new Date(now.getTime() + PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS + 3600000).toISOString(),
        createdAt: new Date(now.getTime() - PUBLISH_TASK_CANCEL_WINDOW_MS - 60000).toISOString(),
      },
      {
        id: 'claim-soon',
        userId: 'user-2',
        channelId: 'channel-2',
        languageCode: 'es',
        status: 'pending',
        publishAt: new Date(now.getTime() + PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS - 3600000).toISOString(),
        createdAt: now.toISOString(),
      },
    ]);

    const tasks = await claimPublishTasks(5);
    expect(tasks.map((t) => t.id).sort()).toEqual(['claim-older', 'claim-soon']);
    const stateStatuses = Object.fromEntries(mockState.tasks.map((task) => [task.id, task.status]));
    expect(stateStatuses['keep-pending']).toBe('pending');
    expect(stateStatuses['claim-older']).toBe('processing');
    expect(stateStatuses['claim-soon']).toBe('processing');
  });

  it('includes retry tasks in the claimable set', async () => {
    const now = new Date();
    setMockTasks([
      {
        id: 'retry-task',
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'retry',
        publishAt: new Date(now.getTime() + PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS - 600000).toISOString(),
        createdAt: new Date(now.getTime() - PUBLISH_TASK_CANCEL_WINDOW_MS - 60000).toISOString(),
      },
    ]);

    const tasks = await claimPublishTasks(2);
    expect(tasks.map((t) => t.id)).toEqual(['retry-task']);
  });

  it('claims cleanup tasks for providers', async () => {
    setMockTasks([
      {
        id: 'cleanup-1',
        userId: 'user-1',
        channelId: 'channel-1',
        languageCode: 'en',
        status: 'cleanup_pending',
        publishAt: '2025-11-20T10:00:00.000Z',
        createdAt: '2025-11-18T10:00:00.000Z',
      },
    ]);

    const result = await claimCleanupTasks(5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('cleanup-1');
  });
});
