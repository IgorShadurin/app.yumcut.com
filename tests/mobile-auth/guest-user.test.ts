import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const prismaMock = {
  guestProfile: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
};

const logAppleSubscriptionEvent = vi.fn();
const reactivateDeletedUser = vi.fn();
const notifyAdminsOfNewUser = vi.fn().mockResolvedValue(undefined);

vi.mock('@/server/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/server/app-store/subscription-logger', () => ({
  logAppleSubscriptionEvent,
}));

vi.mock('@/server/account/reactivate-user', () => ({
  reactivateDeletedUser,
}));

vi.mock('@/server/telegram', () => ({
  notifyAdminsOfNewUser,
}));

const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID');

const txFactories = () => ({
  user: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  guestProfile: { create: vi.fn(), deleteMany: vi.fn() },
  subscriptionPurchase: { updateMany: vi.fn() },
  tokenTransaction: { updateMany: vi.fn() },
  project: { updateMany: vi.fn() },
  userCharacter: { updateMany: vi.fn() },
  projectGroup: { updateMany: vi.fn() },
  publishChannel: { updateMany: vi.fn() },
  publishChannelLanguage: { updateMany: vi.fn() },
  publishChannelOAuthState: { updateMany: vi.fn() },
  publishTask: { updateMany: vi.fn() },
  telegramAccount: { updateMany: vi.fn() },
  telegramLinkToken: { updateMany: vi.fn() },
  mobileSession: { deleteMany: vi.fn() },
  userSettings: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
});

const { getOrCreateGuestUser } = await import('@/server/mobile-auth/guest-user');
const { mergeGuestIntoUser } = await import('@/server/mobile-auth/merge-guest-user');

beforeEach(() => {
  vi.clearAllMocks();
  randomUUIDSpy.mockReturnValue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  prismaMock.guestProfile.findUnique.mockReset();
  prismaMock.guestProfile.update.mockReset();
  prismaMock.guestProfile.delete.mockReset();
  prismaMock.user.update.mockReset();
  prismaMock.user.findUnique.mockReset();
  prismaMock.$transaction.mockReset();
  logAppleSubscriptionEvent.mockReset();
  reactivateDeletedUser.mockReset();
  notifyAdminsOfNewUser.mockReset();
  notifyAdminsOfNewUser.mockResolvedValue(undefined);
});

describe('getOrCreateGuestUser', () => {
  it('creates a new guest user when device is unknown', async () => {
    prismaMock.guestProfile.findUnique.mockResolvedValue(null);
    const tx = txFactories();
    const createdUser = { id: 'guest-user-1', email: 'placeholder', isGuest: true };
    tx.user.create.mockResolvedValue(createdUser);
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx));

    const user = await getOrCreateGuestUser({ deviceId: '  device-123  ', deviceName: 'iPhone', platform: 'iOS', appVersion: '1.0' });

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'guest-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa@guest.yumcut',
          guestDeviceId: 'device-123',
        }),
      }),
    );
    expect(tx.guestProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'guest-user-1', deviceId: 'device-123', deviceName: 'iPhone' }),
      }),
    );
    expect(user).toEqual(createdUser);
    expect(logAppleSubscriptionEvent).toHaveBeenCalledWith('guest_sign_in_created', {
      userId: 'guest-user-1',
      deviceId: 'device-123',
    });
  });

  it('reuses existing guest profile and reactivates deleted users', async () => {
    const existingProfile = {
      id: 'profile-1',
      userId: 'guest-user-2',
      user: { id: 'guest-user-2', deleted: true, isGuest: true },
    };
    prismaMock.guestProfile.findUnique.mockResolvedValue(existingProfile as any);
    prismaMock.user.update.mockResolvedValue({ id: 'guest-user-2' });

    const user = await getOrCreateGuestUser({ deviceId: 'dev-1', platform: 'iOS' });

    expect(reactivateDeletedUser).toHaveBeenCalledWith('guest-user-2');
    expect(prismaMock.guestProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'profile-1' } }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'guest-user-2' },
        data: expect.objectContaining({ guestDeviceId: 'dev-1', isGuest: true, deleted: false }),
      }),
    );
    expect(user.id).toBe('guest-user-2');
    expect(logAppleSubscriptionEvent).toHaveBeenCalledWith('guest_sign_in_existing', {
      userId: 'guest-user-2',
      deviceId: 'dev-1',
    });
  });

  it('creates a new guest when device belongs to converted account', async () => {
    const existingProfile = {
      id: 'profile-2',
      userId: 'full-user-1',
      user: { id: 'full-user-1', deleted: false, isGuest: false },
    };
    prismaMock.guestProfile.findUnique.mockResolvedValue(existingProfile as any);
    const tx = txFactories();
    const createdUser = { id: 'guest-user-99', email: 'placeholder', isGuest: true };
    tx.user.create.mockResolvedValue(createdUser);
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx));

    const user = await getOrCreateGuestUser({ deviceId: 'dev-2' });

    expect(prismaMock.guestProfile.delete).toHaveBeenCalledWith({ where: { id: 'profile-2' } });
    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.guestProfile.create).toHaveBeenCalled();
    expect(user).toEqual(createdUser);
  });
});

describe('mergeGuestIntoUser', () => {
  it('marks same user as converted when IDs match', async () => {
    await mergeGuestIntoUser({ guestUserId: 'user-1', targetUserId: 'user-1' });
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ isGuest: false }) }),
    );
  });

  it('moves guest-owned data into target user and updates balances', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'guest-user-3', isGuest: true, deleted: false, tokenBalance: 25 });

    const tx = txFactories();
    tx.user.findUnique.mockResolvedValue({ id: 'target-user', deleted: false, tokenBalance: 10 });
    prismaMock.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await mergeGuestIntoUser({ guestUserId: 'guest-user-3', targetUserId: 'target-user' });

    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: 'target-user' }, select: expect.any(Object) });
    expect(tx.user.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 'guest-user-3' }, data: expect.objectContaining({ deleted: true }) }),
    );
    expect(tx.user.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'target-user' },
        data: expect.objectContaining({ tokenBalance: 35, isGuest: false }),
      }),
    );
    expect(result).toEqual({ userId: 'target-user', mergedFromGuest: true });
  });
});
