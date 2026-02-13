import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authenticateApiRequest } from '@/server/api-user';

const findUniqueUser = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({
  prisma: {
    user: {
      findUnique: findUniqueUser,
    },
  },
}));

vi.mock('@/server/auth', () => ({
  getAuthSession: vi.fn(),
}));

vi.mock('@/server/mobile-auth', () => ({
  verifyMobileAccessToken: vi.fn(),
}));

import { getAuthSession } from '@/server/auth';
import { verifyMobileAccessToken } from '@/server/mobile-auth';

const mockedSession = vi.mocked(getAuthSession);
const mockedVerifyMobile = vi.mocked(verifyMobileAccessToken);

describe('authenticateApiRequest', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findUniqueUser.mockReset();
    findUniqueUser.mockResolvedValue({ id: 'session-user', deleted: false });
  });

  it('returns mobile context when bearer token is valid', async () => {
    mockedVerifyMobile.mockResolvedValue({ sub: 'user-mobile' } as any);
    const req = new NextRequest('http://localhost/api/projects', {
      headers: new Headers({ authorization: 'Bearer test-token' }),
    });

    const result = await authenticateApiRequest(req);

    expect(result).toEqual({ userId: 'user-mobile', source: 'mobile' });
    expect(mockedSession).not.toHaveBeenCalled();
  });

  it('falls back to session when bearer is missing', async () => {
    mockedSession.mockResolvedValue({ user: { id: 'session-user', email: 'test@example.com', name: 'Test', isAdmin: true } } as any);
    const req = new NextRequest('http://localhost/api/projects');

    const result = await authenticateApiRequest(req);

    expect(result).toEqual({
      userId: 'session-user',
      sessionUser: { id: 'session-user', email: 'test@example.com', name: 'Test', isAdmin: true },
      source: 'session',
    });
    expect(mockedVerifyMobile).not.toHaveBeenCalled();
  });

  it('returns null when neither auth strategy succeeds', async () => {
    mockedSession.mockResolvedValue(null);
    mockedVerifyMobile.mockResolvedValue(null as any);
    const req = new NextRequest('http://localhost/api/projects');

    await expect(authenticateApiRequest(req)).resolves.toBeNull();
  });
});
