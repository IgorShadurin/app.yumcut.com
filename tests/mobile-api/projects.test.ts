import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findMany = vi.fn();
const findFirst = vi.fn();
const requireUser = vi.fn();

vi.mock('@/server/db', () => ({
  prisma: {
    project: {
      findMany,
      findFirst,
    },
  },
}));

vi.mock('@/app/api/mobile/shared/auth', () => ({
  requireMobileUserId: (...args: any[]) => requireUser(...args),
}));

const listRoute = await import('@/app/api/mobile/projects/route');
const detailRoute = await import('@/app/api/mobile/projects/[projectId]/route');

function makeRequest(token?: string) {
  return new NextRequest('http://localhost/api/mobile/projects', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as any);
}

describe('GET /api/mobile/projects', () => {
  beforeEach(() => {
    findMany.mockReset();
    requireUser.mockReset();
  });

  it('rejects when token missing', async () => {
    requireUser.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const res = await listRoute.GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects invalid tokens', async () => {
    requireUser.mockResolvedValue({ error: new Response(null, { status: 401 }) });
    const res = await listRoute.GET(makeRequest('bad'));
    expect(res.status).toBe(401);
  });

  it('returns project summaries', async () => {
    requireUser.mockResolvedValue({ userId: 'user-1' });
    findMany.mockResolvedValue([
      { id: 'p1', title: 'My First Project', status: 'done', createdAt: new Date('2025-11-11T18:00:00Z') },
      { id: 'p2', title: 'Extremely long title that should be truncated because it is ridiculously verbose for testing', status: 'process_script', createdAt: new Date('2025-11-11T17:00:00Z') },
    ]);

    const res = await listRoute.GET(makeRequest('good-token'));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as Array<{ id: string; title: string; status: string; createdAt: string }>;
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({ id: 'p1', title: 'My First Project', status: 'done', createdAt: '2025-11-11T18:00:00.000Z' });
    expect(payload[1].title.endsWith('...')).toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', deleted: false } }));
  });
});

describe('GET /api/mobile/projects/[id]', () => {
  beforeEach(() => {
    requireUser.mockReset();
    findFirst.mockReset();
  });

  it('returns 404 when project missing', async () => {
    requireUser.mockResolvedValue({ userId: 'user-1' });
    findFirst.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/mobile/projects/p1');
    const res = await detailRoute.GET(req, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(404);
  });

  it('returns detail payload', async () => {
    requireUser.mockResolvedValue({ userId: 'user-1' });
    findFirst.mockResolvedValue({
      id: 'p1',
      title: 'Detail Title',
      prompt: 'Prompt',
      status: 'done',
      createdAt: new Date('2025-11-11T18:00:00Z'),
      finalVideoUrl: null,
      finalVideoPath: '/videos/final.mp4',
      languages: ['en', 'es'],
    });
    const req = new NextRequest('http://localhost/api/mobile/projects/p1');
    const res = await detailRoute.GET(req, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.id).toBe('p1');
    expect(payload.languages).toEqual(['en', 'es']);
    expect(findFirst).toHaveBeenCalled();
  });
});
