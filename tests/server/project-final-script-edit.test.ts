import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ProjectStatus } from '@/shared/constants/status';

const prismaMock = {
  project: { findFirst: vi.fn(), update: vi.fn() },
  script: { upsert: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock('@/server/db', () => ({ prisma: prismaMock }));
vi.mock('@/server/auth', () => ({ getAuthSession: vi.fn() }));

import { getAuthSession } from '@/server/auth';

describe('project final script edit api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthSession).mockResolvedValue({ user: { id: 'user-1' } } as any);
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.Done,
      languages: ['en', 'es'],
      deleted: false,
    });
    prismaMock.script.upsert.mockResolvedValue({ text: 'Updated script' });
    prismaMock.project.update.mockResolvedValue({ finalScriptText: 'Updated script' });
    prismaMock.$transaction.mockImplementation(async (fn: any) =>
      fn({ script: prismaMock.script, project: prismaMock.project }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates the final script for the primary language', async () => {
    const route = await import('@/app/api/projects/[projectId]/script/final/route');
    const longScript = 'Updated script '.repeat(30).trim();
    const req = new NextRequest('http://localhost/api/projects/project-1/script/final', {
      method: 'POST',
      body: JSON.stringify({ text: longScript, languageCode: 'en' }),
    });
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(200);
    expect(prismaMock.script.upsert).toHaveBeenCalled();
    expect(prismaMock.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { finalScriptText: longScript },
    }));
  });

  it('rejects edits when project is not done', async () => {
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      status: ProjectStatus.ProcessAudio,
      languages: ['en'],
      deleted: false,
    });
    const route = await import('@/app/api/projects/[projectId]/script/final/route');
    const req = new NextRequest('http://localhost/api/projects/project-1/script/final', {
      method: 'POST',
      body: JSON.stringify({ text: 'Updated script', languageCode: 'en' }),
    });
    const res = await route.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) });
    expect(res.status).toBe(409);
  });
});
