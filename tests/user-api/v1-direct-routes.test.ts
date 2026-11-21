import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireUserApiKey = vi.hoisted(() => vi.fn());
const runWithAuthenticatedApiUser = vi.hoisted(() => vi.fn((_auth: unknown, run: () => unknown) => run()));
const normalizeUserApiIdempotencyKey = vi.hoisted(() => vi.fn((req: Request) => req.headers.get('idempotency-key')?.trim() || null));
const runIdempotentUserApiOperation = vi.hoisted(() => vi.fn(async (input: any) => input.run({ id: 'op-1' })));
const userFindUnique = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn());
const projectFindMany = vi.hoisted(() => vi.fn());
const getTokenSummary = vi.hoisted(() => vi.fn());
const getTokenHistory = vi.hoisted(() => vi.fn());

vi.mock('@/server/user-api/api-auth', () => ({ requireUserApiKey }));
vi.mock('@/server/user-api/api-idempotency', () => ({
  normalizeUserApiIdempotencyKey,
  runIdempotentUserApiOperation,
}));
vi.mock('@/server/api-user', () => ({ runWithAuthenticatedApiUser }));
vi.mock('@/server/db', () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    project: {
      findMany: projectFindMany,
    },
  },
}));
vi.mock('@/server/tokens', () => ({
  getTokenHistory,
  getTokenSummary,
}));

const route = await import('@/app/api/user/v1/[...path]/route');

const authContext = {
  keyId: 'key-1',
  keyName: 'Automation',
  userId: 'user-1',
  scopes: ['read', 'write'],
  sessionUser: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    isAdmin: false,
    preferredLanguage: 'en',
  },
};

function pathParams(path: string) {
  return { params: Promise.resolve({ path: path.split('/').filter(Boolean) }) };
}

function req(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const requestHeaders = new Headers(headers ?? {});
  if (body !== undefined && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }
  return new NextRequest(`http://localhost/api/user/v1/${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, headers?: Record<string, string>) {
  return route[method](req(method, path, body, headers), pathParams(path.split('?')[0] ?? path));
}

describe('user v1 API direct routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserApiKey.mockResolvedValue({ context: authContext, error: null });
    getTokenSummary.mockResolvedValue({ balance: 240 });
    getTokenHistory.mockResolvedValue({
      items: [
        {
          id: 'tx-1',
          delta: -30,
          balanceAfter: 210,
          type: 'projectCreation',
          description: 'Project creation',
          initiator: 'user:user-1',
          metadata: { projectId: 'project-1' },
          createdAt: new Date('2026-07-08T10:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it.each([401, 403])('returns authentication and scope denials before loading account data (%i)', async (status) => {
    requireUserApiKey.mockResolvedValue({
      context: null,
      error: Response.json({ error: { message: 'Access denied' } }, { status }),
    });

    const res = await call('GET', 'account');

    expect(res.status).toBe(status);
    expect(runWithAuthenticatedApiUser).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([false, true])('returns only the key owner and the applicable shutdown date (closed = %s)', async (closed) => {
    vi.stubEnv('SHUTDOWN_MODE', String(closed));
    vi.stubEnv('SHUTDOWN_DATE', '2027-03-01');
    userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      image: null,
      preferredLanguage: 'en',
      createdAt: new Date('2026-07-08T00:00:00.000Z'),
      tokenBalance: 240,
      isGuest: false,
    });

    const res = await call('GET', 'account');

    expect(res.status).toBe(200);
    expect(requireUserApiKey).toHaveBeenCalledWith(expect.any(NextRequest), 'read');
    expect(runWithAuthenticatedApiUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      source: 'user-api',
      sessionUser: expect.objectContaining({ isAdmin: false }),
    }), expect.any(Function));
    expect(userFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
    }));
    const body = await res.json();
    expect(body).toMatchObject({ id: 'user-1', email: 'user@example.com', tokenBalance: 240 });
    expect(body).not.toHaveProperty('deleted');
    if (closed) expect(body.shutdownDate).toBe('2027-03-01');
    else expect(body).not.toHaveProperty('shutdownDate');
  });

  it('lists only projects owned by the authenticated key owner', async () => {
    projectFindMany.mockResolvedValue([
      {
        id: 'project-1',
        title: 'A very long title that should be truncated by the API',
        status: 'done',
        prompt: 'make a video',
        finalVideoUrl: null,
        finalVideoPath: 'video/final.mp4',
        finalVoiceoverUrl: null,
        createdAt: new Date('2026-07-08T10:00:00.000Z'),
        updatedAt: new Date('2026-07-08T11:00:00.000Z'),
      },
    ]);

    const res = await call('GET', 'projects?limit=10&status=done');

    expect(res.status).toBe(200);
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        deleted: false,
        status: 'done',
      }),
      take: 11,
    }));
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      id: 'project-1',
      title: 'A very long title that shou...',
      finalVideoUrl: 'video/final.mp4',
    });
    expect(body.items[0]).not.toHaveProperty('userId');
  });

  it('uses the authenticated user id for token history', async () => {
    const res = await call('GET', 'tokens/history?page=1&pageSize=20');

    expect(res.status).toBe(200);
    expect(getTokenHistory).toHaveBeenCalledWith({ userId: 'user-1', page: 1, pageSize: 20 });
    const body = await res.json();
    expect(body.items[0]).toMatchObject({ id: 'tx-1', delta: -30 });
  });

  it('gets token summary and cost data without exposing another user record', async () => {
    const res = await call('GET', 'tokens');

    expect(res.status).toBe(200);
    expect(requireUserApiKey).toHaveBeenCalledWith(expect.any(NextRequest), 'read');
    expect(getTokenSummary).toHaveBeenCalledWith('user-1');
    const body = await res.json();
    expect(body.balance).toBe(240);
    expect(body).toHaveProperty('minimumProjectTokens');
    expect(body).not.toHaveProperty('userId');
  });

  it('gets account language through the authenticated user id', async () => {
    userFindUnique.mockResolvedValue({ preferredLanguage: 'ru' });

    const res = await call('GET', 'account/language');

    expect(res.status).toBe(200);
    expect(requireUserApiKey).toHaveBeenCalledWith(expect.any(NextRequest), 'read');
    expect(userFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      select: { preferredLanguage: true },
    }));
    await expect(res.json()).resolves.toEqual({ language: 'ru' });
  });

  it('quotes project cost with read scope and does not require idempotency', async () => {
    const res = await call('POST', 'project-cost', {
      prompt: 'Create a short story',
      durationSeconds: 30,
      projectExperience: 'story',
      languages: ['en', 'es'],
    });

    expect(res.status).toBe(200);
    expect(requireUserApiKey).toHaveBeenCalledWith(expect.any(NextRequest), 'read');
    expect(runIdempotentUserApiOperation).not.toHaveBeenCalled();
    expect(getTokenSummary).toHaveBeenCalledWith('user-1');
    const body = await res.json();
    expect(body.balance).toBe(240);
    expect(body.detail).toMatchObject({ projectExperience: 'story', languageCount: 2 });
  });

  it('updates account language with write scope and the authenticated user id', async () => {
    userFindUnique.mockResolvedValue({ id: 'user-1' });
    userUpdate.mockResolvedValue({ preferredLanguage: 'ru' });

    const res = await call('PATCH', 'account/language', { language: 'ru' });

    expect(res.status).toBe(200);
    expect(requireUserApiKey).toHaveBeenCalledWith(expect.any(NextRequest), 'write');
    expect(userFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { preferredLanguage: 'ru' },
    }));
  });

  it('requires an idempotency key for project creation before proxying the write', async () => {
    const res = await call('POST', 'projects', {
      prompt: 'Create a short story',
      durationSeconds: 30,
      projectExperience: 'story',
    });

    expect(res.status).toBe(400);
    expect(requireUserApiKey).toHaveBeenCalledWith(expect.any(NextRequest), 'write');
    expect(runIdempotentUserApiOperation).not.toHaveBeenCalled();
  });
});
