import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';

const deleteMany = vi.fn();
const create = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const findUniqueUser = vi.fn();
const reactivateDeletedUser = vi.fn();

vi.mock('@/server/db', () => ({
  prisma: {
    mobileSession: {
      deleteMany,
      create,
      findFirst,
      update,
    },
    user: {
      findUnique: findUniqueUser,
    },
  },
}));

vi.mock('@/server/account/reactivate-user', () => ({
  reactivateDeletedUser,
}));

vi.mock('@/server/config', () => ({
  config: {
    MOBILE_ACCESS_TOKEN_TTL_MINUTES: 30,
    MOBILE_REFRESH_TOKEN_TTL_DAYS: 180,
    MOBILE_JWT_SECRET: 'super-secret-for-tests-1234567890',
    NEXTAUTH_SECRET: 'fallback-secret',
  },
}));

const { issueMobileSessionTokens, refreshMobileSessionTokens, revokeMobileSession } = await import('@/server/mobile-auth');

const uuidSpy = vi.spyOn(crypto, 'randomUUID');
const randomBytesSpy = vi.spyOn(crypto, 'randomBytes');

beforeEach(() => {
  deleteMany.mockReset();
  create.mockReset();
  findFirst.mockReset();
  update.mockReset();
  findUniqueUser.mockReset();
  reactivateDeletedUser.mockReset();
  uuidSpy.mockReturnValue('11111111-2222-3333-4444-555555555555');
  randomBytesSpy.mockImplementation((size: number) => Buffer.from(Array(size).fill(0x61)));
  findUniqueUser.mockImplementation(async ({ where }: any) => ({ id: where.id, deleted: false }));
});

describe('issueMobileSessionTokens', () => {
  it('creates a session and normalizes the device id', async () => {
    const result = await issueMobileSessionTokens({
      userId: 'user-1',
      deviceId: '  ios-device  ',
      deviceName: 'iPhone 17 Pro',
      platform: 'iOS',
      appVersion: '1.0.0',
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', deviceId: 'ios-device' } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deviceId: 'ios-device', userId: 'user-1' }),
      })
    );
    expect(result.sessionId).toBe('11111111-2222-3333-4444-555555555555');
    expect(result.userId).toBe('user-1');
    expect(result.refreshToken.length).toBeGreaterThan(0);
    expect(typeof result.accessToken).toBe('string');
  });

  it('reactivates deleted users before issuing a session', async () => {
    findUniqueUser.mockResolvedValueOnce({ id: 'user-1', deleted: true });

    await issueMobileSessionTokens({
      userId: 'user-1',
      deviceId: 'ios-device',
      deviceName: 'iPhone 17 Pro',
      platform: 'iOS',
      appVersion: '1.0.0',
    });

    expect(reactivateDeletedUser).toHaveBeenCalledWith('user-1');
  });
});

describe('refreshMobileSessionTokens', () => {
  it('returns null when the refresh token is unknown', async () => {
    findFirst.mockResolvedValueOnce(null);
    const result = await refreshMobileSessionTokens({ refreshToken: 'missing' });
    expect(result).toBeNull();
  });

  it('rotates the refresh token when valid', async () => {
    findFirst.mockResolvedValueOnce({
      id: 'session-abc',
      userId: 'user-1',
      deviceId: 'ios-device',
      expiresAt: new Date(Date.now() + 10_000),
      revokedAt: null,
      deviceName: 'iPhone 17 Pro',
      platform: 'iOS',
      appVersion: '1.0.0',
      user: { deleted: false },
    });

    const result = await refreshMobileSessionTokens({ refreshToken: 'refresh-token-1234567890', deviceId: 'ios-device' });

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('session-abc');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-abc' },
        data: expect.objectContaining({ refreshTokenHash: expect.any(String) }),
      })
    );
  });
});

describe('revokeMobileSession', () => {
  it('no-ops when session missing', async () => {
    findFirst.mockResolvedValueOnce(null);
    const success = await revokeMobileSession('refresh-token-123');
    expect(success).toBe(false);
  });

  it('marks sessions as revoked when found', async () => {
    findFirst.mockResolvedValueOnce({ id: 'session-abc' });
    const success = await revokeMobileSession('refresh-token-1234567890');
    expect(success).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 'session-abc' }, data: { revokedAt: expect.any(Date) } });
  });
});
