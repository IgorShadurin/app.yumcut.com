import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const projectFindFirst = vi.hoisted(() => vi.fn());
const projectFindUnique = vi.hoisted(() => vi.fn());
const imageAssetFindMany = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const projectUpdate = vi.hoisted(() => vi.fn());
const projectUpdateMany = vi.hoisted(() => vi.fn());
const statusHistoryCreate = vi.hoisted(() => vi.fn());
const tokenTransactionFindMany = vi.hoisted(() => vi.fn());
const tokenTransactionCreate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn());
const assertDaemonAuth = vi.hoisted(() => vi.fn());
const notifyProjectStatusChange = vi.hoisted(() => vi.fn());
const sendProjectReadyEmail = vi.hoisted(() => vi.fn());
const sendImageProjectReadyEmail = vi.hoisted(() => vi.fn());
const sendProjectFailedEmail = vi.hoisted(() => vi.fn());
const jobFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({
  prisma: {
    project: {
      findFirst: projectFindFirst,
      findUnique: projectFindUnique,
      update: projectUpdate,
      updateMany: projectUpdateMany,
    },
    imageAsset: {
      findMany: imageAssetFindMany,
    },
    job: {
      findFirst: jobFindFirst,
    },
    $transaction: transaction,
  },
}));

vi.mock('@/server/auth', () => ({
  assertDaemonAuth,
}));

vi.mock('@/server/telegram', () => ({
  notifyProjectStatusChange,
}));

vi.mock('@/server/emails/project-lifecycle', () => ({
  sendImageProjectReadyEmail,
  sendProjectReadyEmail,
  sendProjectFailedEmail,
}));

function makeRequest(projectId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/daemon/projects/${projectId}/status`, {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

describe('daemon status token refunds on project failure', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    assertDaemonAuth.mockResolvedValue('daemon-1');
    projectFindFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      currentDaemonId: 'daemon-1',
      languages: ['en'],
      deleted: false,
    });
    projectFindUnique.mockResolvedValue(null);
    imageAssetFindMany.mockResolvedValue([]);
    projectUpdate.mockResolvedValue({});
    projectUpdateMany.mockResolvedValue({ count: 1 });
    statusHistoryCreate.mockResolvedValue({});
    userUpdate.mockResolvedValue({});
    notifyProjectStatusChange.mockResolvedValue(undefined);
    sendProjectReadyEmail.mockResolvedValue({ sent: true, skipped: false, error: null });
    sendImageProjectReadyEmail.mockResolvedValue({ sent: true, skipped: false, error: null });
    sendProjectFailedEmail.mockResolvedValue({ sent: true, skipped: false, error: null });
    jobFindFirst.mockResolvedValue(null);
    transaction.mockImplementation(async (callback: any) => callback({
      project: { update: projectUpdate, updateMany: projectUpdateMany },
      audioCandidate: { updateMany: vi.fn(), findUnique: vi.fn() },
      script: { findUnique: vi.fn() },
      projectTemplateImage: {},
      projectStatusHistory: { create: statusHistoryCreate },
      tokenTransaction: {
        findMany: tokenTransactionFindMany,
        create: tokenTransactionCreate,
      },
      user: {
        findUnique: userFindUnique,
        update: userUpdate,
      },
    }));
  });

  it('refunds net spent tokens when a project moves to error', async () => {
    tokenTransactionFindMany.mockResolvedValue([
      { delta: -150, metadata: { projectId: 'project-1' } },
      { delta: 40, metadata: { projectId: 'project-1' } },
      { delta: -70, metadata: { projectId: 'other-project' } },
    ]);
    userFindUnique.mockResolvedValue({ tokenBalance: 20 });
    projectFindUnique.mockResolvedValueOnce({
      id: 'project-1',
      title: 'Failed project',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User Name',
        preferredLanguage: 'en',
        settings: { projectEmailsEnabled: true },
      },
    });

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Error,
      message: 'Video parts rendering failed',
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenBalance: 130 },
    });
    expect(tokenTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'user-1',
        delta: 110,
        balanceAfter: 130,
        type: 'PROJECT_FAILURE_REFUND',
        description: 'Project failed refund',
        metadata: { projectId: 'project-1' },
      }),
    }));
    expect(statusHistoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: ProjectStatus.Error,
        message: expect.stringContaining('Refunded 110 tokens'),
      }),
    }));
    expect(sendProjectFailedEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
      refundedTokens: 110,
    }));
  });

  it('does not double refund if ledger is already balanced for the project', async () => {
    tokenTransactionFindMany.mockResolvedValue([
      { delta: -100, metadata: { projectId: 'project-1' } },
      { delta: 100, metadata: { projectId: 'project-1' } },
    ]);

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Error,
      message: 'Video parts rendering failed',
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);

    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(tokenTransactionCreate).not.toHaveBeenCalled();
    expect(statusHistoryCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: ProjectStatus.Error,
        message: 'Video parts rendering failed',
      }),
    }));
    expect(sendProjectFailedEmail).not.toHaveBeenCalled();
  });

  it('does not send project-failed email when project is already error', async () => {
    projectFindFirst.mockResolvedValueOnce({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Error,
      currentDaemonId: 'daemon-1',
      deleted: false,
      languages: ['en'],
    });
    tokenTransactionFindMany.mockResolvedValue([]);

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Error,
      message: 'Still failed',
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(sendProjectFailedEmail).not.toHaveBeenCalled();
  });

  it('sends project-ready email when project transitions to done', async () => {
    projectFindFirst.mockResolvedValueOnce({
        id: 'project-1',
        userId: 'user-1',
        status: ProjectStatus.ProcessVideoMain,
        currentDaemonId: 'daemon-1',
        deleted: false,
        languages: ['en'],
      });
    projectFindUnique.mockResolvedValueOnce({
        id: 'project-1',
        title: 'Project title',
        finalVideoUrl: 'https://cdn.example.com/final.mp4',
        finalVideoPath: null,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'User Name',
          preferredLanguage: 'en',
          settings: { projectEmailsEnabled: true },
        },
      });

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Done,
      message: 'Video ready',
      extra: { finalVideoPaths: { en: 'video/final.mp4' } },
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(sendProjectReadyEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
      finalVideoUrl: 'https://cdn.example.com/final.mp4',
    }));
  });

  it('does not send project-ready email when status is already done', async () => {
    projectFindFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      currentDaemonId: 'daemon-1',
      deleted: false,
      languages: ['en'],
    });

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Done,
      message: 'Video ready',
      extra: { finalVideoPaths: { en: 'video/final.mp4' } },
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(sendProjectReadyEmail).not.toHaveBeenCalled();
  });

  it('sends an image-ready email when an image project transitions to done', async () => {
    projectFindFirst.mockResolvedValueOnce({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.ProcessImagesGeneration,
      currentDaemonId: 'daemon-1',
      deleted: false,
      languages: ['en'],
    });
    jobFindFirst.mockResolvedValueOnce({ payload: { projectExperience: 'image-generation' } });
    projectFindUnique.mockResolvedValueOnce({
      id: 'project-1',
      title: 'Image Prank',
      finalVideoUrl: null,
      finalVideoPath: null,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User Name',
        preferredLanguage: 'en',
        settings: { projectEmailsEnabled: true },
      },
    });

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Done,
      message: 'Image ready',
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(sendImageProjectReadyEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      email: 'user@example.com',
      projectId: 'project-1',
      projectTitle: 'Image Prank',
    }));
    expect(sendProjectReadyEmail).not.toHaveBeenCalled();
  });

  it('returns not found for deleted projects and performs no writes', async () => {
    projectFindFirst.mockResolvedValueOnce(null);

    const route = await import('@/app/api/daemon/projects/[projectId]/status/route');
    const req = makeRequest('project-1', {
      status: ProjectStatus.Done,
      message: 'Video ready',
    });

    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
    expect(projectUpdate).not.toHaveBeenCalled();
    expect(statusHistoryCreate).not.toHaveBeenCalled();
  });
});
