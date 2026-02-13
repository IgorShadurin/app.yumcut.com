import { describe, it, expect, beforeEach, vi } from 'vitest';

const subscriptionFindFirst = vi.fn();

vi.mock('@/server/db', () => ({
  prisma: {
    subscriptionPurchase: {
      findFirst: subscriptionFindFirst,
    },
  },
}));

const { getUserSubscriptionStatus } = await import('@/server/subscriptions');

beforeEach(() => {
  subscriptionFindFirst.mockReset();
});

describe('getUserSubscriptionStatus', () => {
  it('returns inactive status when no purchases exist', async () => {
    subscriptionFindFirst.mockResolvedValueOnce(null);
    subscriptionFindFirst.mockResolvedValueOnce(null);

    const status = await getUserSubscriptionStatus('user-1');

    expect(status.active).toBe(false);
    expect(status.productId).toBeNull();
    expect(status.expiresAt).toBeNull();
    expect(subscriptionFindFirst).toHaveBeenCalledTimes(2);
  });

  it('returns active when a non-expired purchase exists', async () => {
    const futureDate = new Date(Date.now() + 60_000);
    subscriptionFindFirst.mockResolvedValueOnce({
      productId: 'yumcut_weekly_basic',
      expiresDate: futureDate,
      purchaseDate: new Date(),
      transactionId: 'tx-1',
      environment: 'Sandbox',
    });

    const status = await getUserSubscriptionStatus('user-1');

    expect(status.active).toBe(true);
    expect(status.productId).toBe('yumcut_weekly_basic');
    expect(status.expiresAt).toBe(futureDate.toISOString());
    expect(subscriptionFindFirst).toHaveBeenCalledTimes(1);
  });

  it('returns last purchase metadata when only expired purchases exist', async () => {
    subscriptionFindFirst.mockResolvedValueOnce(null);
    const pastDate = new Date(Date.now() - 86_400_000);
    subscriptionFindFirst.mockResolvedValueOnce({
      productId: 'yumcut_monthly_basic',
      expiresDate: pastDate,
      purchaseDate: pastDate,
      transactionId: 'tx-2',
      environment: 'Production',
    });

    const status = await getUserSubscriptionStatus('user-2');

    expect(status.active).toBe(false);
    expect(status.productId).toBe('yumcut_monthly_basic');
    expect(status.lastTransactionId).toBe('tx-2');
    expect(subscriptionFindFirst).toHaveBeenCalledTimes(2);
  });
});
