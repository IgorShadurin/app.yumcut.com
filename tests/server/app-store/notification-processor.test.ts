import { describe, it, expect, beforeEach, vi } from 'vitest';

const findFirst = vi.fn();
const findUser = vi.fn();

vi.mock('@/server/db', () => ({
  prisma: {
    subscriptionPurchase: {
      findFirst,
    },
    user: {
      findUnique: findUser,
    },
  },
}));

const processIosSubscriptionPurchase = vi.fn();

vi.mock('@/server/subscriptions', () => ({
  processIosSubscriptionPurchase,
}));

const notifyAdminsOfSubscriptionCancellation = vi.fn();

vi.mock('@/server/telegram', () => ({
  notifyAdminsOfSubscriptionCancellation,
}));

const decodeSignedTransactionPayload = vi.fn();

vi.mock('@/server/app-store/signed-data-verifier', () => ({
  decodeSignedTransactionPayload,
}));

const { processAppStoreServerNotification } = await import('@/server/app-store/notification-processor');

function buildSignedPayload(data: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ data })).toString('base64url');
  return `${header}.${body}.signature`;
}

const baseRecord = {
  id: 'notif-1',
  notificationType: 'DID_RENEW',
  subtype: null,
  environment: 'Sandbox',
  notificationUuid: null,
  signedPayload: '',
  payload: null,
  headers: null,
  createdAt: new Date(),
};

describe('processAppStoreServerNotification', () => {
  beforeEach(() => {
    findFirst.mockReset();
    findUser.mockReset();
    processIosSubscriptionPurchase.mockReset();
    notifyAdminsOfSubscriptionCancellation.mockReset();
    processIosSubscriptionPurchase.mockResolvedValue({
      alreadyProcessed: false,
      tokensGranted: 150,
      balance: 750,
      productId: 'yumcut_weekly_basic',
      transactionId: 'tx-123',
      expiresAt: null,
    });
    decodeSignedTransactionPayload.mockReset();
    decodeSignedTransactionPayload.mockResolvedValue({
      appAccountToken: 'user-1',
      originalTransactionId: 'orig-123',
      transactionId: 'tx-123',
      productId: 'yumcut_weekly_basic',
    });
    findUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com', name: 'User' });
    findFirst.mockResolvedValue(null);
  });

  it('credits tokens for eligible DID_RENEW notifications', async () => {
    const signedPayload = buildSignedPayload({
      status: 1,
      signedTransactionInfo: 'signed-jws',
      originalTransactionId: 'orig-123',
    });
    await processAppStoreServerNotification({
      ...baseRecord,
      signedPayload,
    } as any);

    expect(processIosSubscriptionPurchase).toHaveBeenCalledWith({
      userId: 'user-1',
      signedTransactions: ['signed-jws'],
      source: 'auto_renew',
    });
    expect(notifyAdminsOfSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('skips when notification type is not eligible', async () => {
    const signedPayload = buildSignedPayload({
      status: 1,
      signedTransactionInfo: 'signed-jws',
      originalTransactionId: 'orig-123',
    });

    await processAppStoreServerNotification({
      ...baseRecord,
      notificationType: 'EXPIRE',
      signedPayload,
    } as any);

    expect(processIosSubscriptionPurchase).not.toHaveBeenCalled();
    expect(notifyAdminsOfSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('skips when owner cannot be resolved', async () => {
    const signedPayload = buildSignedPayload({
      status: 1,
      signedTransactionInfo: 'signed-jws',
      originalTransactionId: 'orig-missing',
    });
    decodeSignedTransactionPayload.mockResolvedValueOnce({
      appAccountToken: null,
      originalTransactionId: 'orig-missing',
      transactionId: 'tx-missing',
      productId: 'yumcut_weekly_basic',
    });
    findUser.mockResolvedValueOnce(null);
    findFirst.mockResolvedValueOnce(null);

    await processAppStoreServerNotification({
      ...baseRecord,
      signedPayload,
    } as any);

    expect(processIosSubscriptionPurchase).not.toHaveBeenCalled();
    expect(notifyAdminsOfSubscriptionCancellation).not.toHaveBeenCalled();
  });

  it('notifies admins when subscription expires voluntarily', async () => {
    const signedPayload = buildSignedPayload({
      status: 2,
      signedTransactionInfo: 'signed-jws',
      originalTransactionId: 'orig-123',
    });

    await processAppStoreServerNotification({
      ...baseRecord,
      notificationType: 'EXPIRED',
      subtype: 'VOLUNTARY',
      signedPayload,
    } as any);

    expect(processIosSubscriptionPurchase).not.toHaveBeenCalled();
    expect(notifyAdminsOfSubscriptionCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        productId: 'yumcut_weekly_basic',
        reason: 'VOLUNTARY',
      }),
    );
  });
});
