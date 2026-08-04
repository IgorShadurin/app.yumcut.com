import { describe, expect, it, vi } from 'vitest';
import { ProjectStatus } from '@/shared/constants/status';

function jsonRequest(body: unknown) {
  return new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('daemon status lock release', () => {
  it('releases project locks idempotently when a job reaches a terminal status', async () => {
    vi.resetModules();
    const jobUpdate = vi.fn(async () => ({}));
    const projectUpdate = vi.fn(async () => ({}));
    const projectUpdateMany = vi.fn(async () => ({ count: 0 }));
    const prisma = {
      job: {
        findUnique: vi.fn(async () => ({
          id: 'job-1',
          projectId: 'project-1',
          daemonId: 'daemon-1',
          status: 'running',
        })),
      },
      $transaction: vi.fn(async (cb: any) => cb({
        job: { update: jobUpdate },
        project: { update: projectUpdate, updateMany: projectUpdateMany },
      })),
    };
    vi.doMock('@/server/db', () => ({ prisma }));
    vi.doMock('@/server/auth', () => ({ assertDaemonAuth: async () => 'daemon-1' }));

    const route = await import('@/app/api/daemon/jobs/[jobId]/status/route');
    const response = await route.POST(jsonRequest({ status: 'failed' }), {
      params: Promise.resolve({ jobId: 'job-1' }),
    });

    expect(response.status).toBe(200);
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'failed' },
    });
    expect(projectUpdateMany).toHaveBeenCalledWith({
      where: { id: 'project-1', currentDaemonId: 'daemon-1' },
      data: { currentDaemonId: null, currentDaemonLockedAt: null },
    });
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it('releases daemon locks idempotently when project status is terminal', async () => {
    vi.resetModules();
    const projectUpdate = vi.fn(async () => ({}));
    const projectUpdateMany = vi.fn(async () => ({ count: 0 }));
    const historyCreate = vi.fn(async () => ({}));
    const prisma = {
      project: {
        findFirst: vi.fn(async () => ({
          id: 'project-1',
          userId: 'user-1',
          status: ProjectStatus.ProcessScript,
          currentDaemonId: 'daemon-1',
          languages: ['en'],
          targetLanguage: 'en',
        })),
        update: projectUpdate,
        updateMany: projectUpdateMany,
      },
      $transaction: vi.fn(async (cb: any) => cb({
        project: { update: projectUpdate, updateMany: projectUpdateMany },
        script: { findUnique: vi.fn(async () => null) },
        audioCandidate: {
          findUnique: vi.fn(async () => null),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
        imageAsset: { findMany: vi.fn(async () => []) },
        projectStatusHistory: { create: historyCreate },
        tokenTransaction: {
          findMany: vi.fn(async () => []),
          create: vi.fn(async () => ({})),
        },
        user: {
          findUnique: vi.fn(async () => ({ tokenBalance: 0 })),
          update: vi.fn(async () => ({})),
        },
      })),
    };
    vi.doMock('@/server/db', () => ({ prisma }));
    vi.doMock('@/server/auth', () => ({ assertDaemonAuth: async () => 'daemon-1' }));
    vi.doMock('@/server/telegram', () => ({ notifyProjectStatusChange: vi.fn(async () => {}) }));
    vi.doMock('@/server/emails/project-lifecycle', () => ({
      sendProjectFailedEmail: vi.fn(async () => {}),
      sendProjectReadyEmail: vi.fn(async () => {}),
    }));
    vi.doMock('@/server/projects/helpers', () => ({ storeTemplateImageMetadata: vi.fn(async () => {}) }));

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const response = await route.POST(jsonRequest({ status: ProjectStatus.Cancelled, message: 'cancelled' }), {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(response.status).toBe(200);
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { status: ProjectStatus.Cancelled },
    });
    expect(historyCreate).toHaveBeenCalledWith({
      data: {
        projectId: 'project-1',
        status: ProjectStatus.Cancelled,
        message: 'cancelled',
        extra: undefined,
      },
    });
    expect(projectUpdateMany).toHaveBeenCalledWith({
      where: { id: 'project-1', currentDaemonId: 'daemon-1' },
      data: { currentDaemonId: null, currentDaemonLockedAt: null },
    });
  });
});
