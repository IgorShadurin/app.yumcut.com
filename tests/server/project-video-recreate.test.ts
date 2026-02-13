import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const prismaMock = {
  project: { findFirst: vi.fn(), update: vi.fn() },
  job: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  videoAsset: { deleteMany: vi.fn() },
  projectLanguageProgress: { upsert: vi.fn() },
  projectStatusHistory: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/auth', () => ({ getAuthSession: vi.fn() }));
vi.mock('@/server/storage', () => ({ deleteStoredMedia: vi.fn() }));

import { getAuthSession } from '@/server/auth';
import { deleteStoredMedia } from '@/server/storage';

describe('project video recreate api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      deleted: false,
      template: { customData: { type: 'custom', customId: 'v2-comics' } },
      videos: [{ id: 'vid-1', path: 'video/2024/01/final.mp4' }],
      languages: ['en'],
    });
    prismaMock.job.findFirst.mockResolvedValue({ daemonId: 'daemon-1' });
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn({
      videoAsset: prismaMock.videoAsset,
      project: prismaMock.project,
      projectLanguageProgress: prismaMock.projectLanguageProgress,
      job: prismaMock.job,
      projectStatusHistory: prismaMock.projectStatusHistory,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queues a re-create job and deletes stored videos', async () => {
    const route = await import('@/app/api/projects/[projectId]/video/recreate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/video/recreate', {
      method: 'POST',
    });
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(prismaMock.job.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'video_parts' }),
    }));
    expect(deleteStoredMedia).toHaveBeenCalledWith(['video/2024/01/final.mp4'], { userId: 'user-1' });
  });

  it('rejects non-custom templates', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      deleted: false,
      template: { customData: { type: 'legacy' } },
      videos: [],
    });
    const route = await import('@/app/api/projects/[projectId]/video/recreate/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/video/recreate', {
      method: 'POST',
    });
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(400);
  });
});
