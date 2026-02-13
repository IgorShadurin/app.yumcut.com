import { describe, it, expect, beforeEach, vi } from 'vitest';

const subscriptionCreate = vi.fn();
const subscriptionFindUnique = vi.fn();
const subscriptionUpdate = vi.fn();
const userFindUnique = vi.fn();
const transactionRunner = vi.fn();
const notifyAdminsOfSubscriptionPurchase = vi.fn();

vi.mock('@/server/db', () => ({
  prisma: {
    subscriptionPurchase: {
      findUnique: subscriptionFindUnique,
      update: subscriptionUpdate,
    },
    user: {
      findUnique: userFindUnique,
    },
    $transaction: transactionRunner,
  },
}));

const grantTokens = vi.fn();

vi.mock('@/server/tokens', () => ({
  grantTokens,
  TOKEN_TRANSACTION_TYPES: { subscriptionCredit: 'subscriptionCredit' },
}));

const decodeSignedTransactionPayload = vi.fn();

vi.mock('@/server/app-store/signed-data-verifier', () => ({
  decodeSignedTransactionPayload,
}));

vi.mock('@/server/config', () => ({
  config: {
    APPLE_IAP_SHARED_SECRET: 'secret',
  },
}));

vi.mock('@/server/telegram', () => ({
  notifyAdminsOfSubscriptionPurchase,
}));

const { processIosSubscriptionPurchase, SubscriptionError } = await import('@/server/subscriptions');

beforeEach(() => {
  subscriptionCreate.mockReset();
  subscriptionFindUnique.mockReset();
  subscriptionUpdate.mockReset();
  userFindUnique.mockReset();
  transactionRunner.mockReset();
  grantTokens.mockReset();
  decodeSignedTransactionPayload.mockReset();
  notifyAdminsOfSubscriptionPurchase.mockReset();
  notifyAdminsOfSubscriptionPurchase.mockResolvedValue(undefined);

  subscriptionFindUnique.mockResolvedValue(null);
  subscriptionUpdate.mockResolvedValue(null);
  grantTokens.mockResolvedValue(450);
  transactionRunner.mockImplementation(async (callback) =>
    callback({
      subscriptionPurchase: { create: subscriptionCreate },
      user: { update: vi.fn(), findUnique: vi.fn() },
      tokenTransaction: { create: vi.fn() },
    }),
  );
});

describe('processIosSubscriptionPurchase (signed transactions)', () => {
  it('credits tokens when signed transactions are valid', async () => {
    const purchaseDate = Date.now();
    decodeSignedTransactionPayload.mockResolvedValueOnce({
      productId: 'yumcut_weekly_basic',
      transactionId: 'tx-1',
      originalTransactionId: 'orig-1',
      purchaseDate,
      environment: 'Sandbox',
    });

    const result = await processIosSubscriptionPurchase({
      userId: 'user-1',
      signedTransactions: ['signed-payload'],
    });

    expect(result.alreadyProcessed).toBe(false);
    expect(result.productId).toBe('yumcut_weekly_basic');
    expect(subscriptionCreate).toHaveBeenCalled();
    expect(grantTokens).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.anything(),
    );
    expect(notifyAdminsOfSubscriptionPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'user_purchase' }),
    );
  });

  it('throws when signed payload lacks recognized products and no receipt provided', async () => {
    decodeSignedTransactionPayload.mockResolvedValueOnce({ productId: 'unknown', transactionId: 'tx-2' });
    await expect(
      processIosSubscriptionPurchase({ userId: 'user-1', signedTransactions: ['signed'] })
    ).rejects.toBeInstanceOf(SubscriptionError);
  });

  it('refreshes metadata when duplicate transaction carries new expiry', async () => {
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    const newDate = new Date('2025-02-01T00:00:00.000Z');
    subscriptionFindUnique.mockResolvedValueOnce({
      userId: 'user-1',
      transactionId: 'tx-dup',
      expiresDate: oldDate,
      purchaseDate: oldDate,
      environment: 'Sandbox',
    });
    subscriptionUpdate.mockResolvedValueOnce({
      transactionId: 'tx-dup',
      expiresDate: newDate,
      purchaseDate: newDate,
      environment: 'Sandbox',
    });
    decodeSignedTransactionPayload.mockResolvedValueOnce({
      productId: 'yumcut_weekly_basic',
      transactionId: 'tx-dup',
      originalTransactionId: 'tx-dup',
      purchaseDate: newDate.getTime(),
      expiresDate: newDate.getTime(),
      environment: 'Sandbox',
    });

    const result = await processIosSubscriptionPurchase({
      userId: 'user-1',
      signedTransactions: ['signed-payload'],
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(result.expiresAt).toBe(newDate.toISOString());
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: 'tx-dup' },
        data: expect.objectContaining({ expiresDate: newDate, purchaseDate: newDate }),
      })
    );
  });

  it('transfers ownership when duplicate transaction belongs to different user', async () => {
    const purchaseDate = new Date('2025-03-01T00:00:00.000Z');
    subscriptionFindUnique.mockResolvedValueOnce({
      userId: 'user-old',
      transactionId: 'tx-share',
      expiresDate: purchaseDate,
      purchaseDate,
      environment: 'Sandbox',
    });
    subscriptionUpdate.mockResolvedValueOnce({
      userId: 'user-new',
      transactionId: 'tx-share',
      expiresDate: purchaseDate,
      purchaseDate,
      environment: 'Sandbox',
    });
    decodeSignedTransactionPayload.mockResolvedValueOnce({
      productId: 'yumcut_weekly_basic',
      transactionId: 'tx-share',
      originalTransactionId: 'tx-share',
      purchaseDate: purchaseDate.getTime(),
      expiresDate: purchaseDate.getTime(),
      environment: 'Sandbox',
    });

    const result = await processIosSubscriptionPurchase({
      userId: 'user-new',
      signedTransactions: ['signed'],
    });

    expect(result.alreadyProcessed).toBe(true);
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-new' }),
      })
    );
  });

  it('propagates guest purchase source to admin notifications', async () => {
    decodeSignedTransactionPayload.mockResolvedValueOnce({
      productId: 'yumcut_weekly_basic',
      transactionId: 'tx-guest',
      originalTransactionId: 'tx-guest',
      purchaseDate: Date.now(),
      environment: 'Production',
    });

    await processIosSubscriptionPurchase({
      userId: 'guest-user',
      signedTransactions: ['signed-payload'],
      source: 'guest_purchase',
    });

    expect(notifyAdminsOfSubscriptionPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'guest_purchase', userId: 'guest-user' }),
    );
  });
});
