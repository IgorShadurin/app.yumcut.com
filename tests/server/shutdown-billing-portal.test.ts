import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), findFirst: vi.fn(), retrieve: vi.fn(), create: vi.fn(),
}));
vi.mock('@/server/db', () => ({
  prisma: { subscriptionPurchase: { findMany: mocks.findMany, findFirst: mocks.findFirst } },
}));
vi.mock('@/server/stripe/client', () => ({
  getStripeClient: () => ({
    subscriptions: { retrieve: mocks.retrieve },
    billingPortal: { sessions: { create: mocks.create } },
  }),
}));
vi.mock('@/server/config', () => ({
  config: { NEXTAUTH_URL: 'https://example.test', STRIPE_BILLING_PORTAL_RETURN_PATH: '/account' },
}));
const { createStripeBillingPortalSession } = await import('@/server/stripe/subscriptions');

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('SHUTDOWN_MODE', 'true');
  mocks.findMany.mockResolvedValue([{ payload: { customerId: 'cus_1' } }]);
  mocks.findFirst.mockResolvedValue({ originalTransactionId: 'sub_1' });
  mocks.create.mockResolvedValue({ url: 'https://portal.example.test' });
});
afterEach(() => vi.unstubAllEnvs());

it('opens only cancellation for the customer’s existing subscription', async () => {
  mocks.retrieve.mockResolvedValue({ id: 'sub_1', status: 'active', customer: 'cus_1' });
  await createStripeBillingPortalSession('user-1');
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }));
  expect(mocks.create).toHaveBeenCalledWith({
    customer: 'cus_1', return_url: 'https://example.test/account',
    flow_data: {
      type: 'subscription_cancel', subscription_cancel: { subscription: 'sub_1' },
      after_completion: { type: 'redirect', redirect: { return_url: 'https://example.test/account' } },
    },
  });
});

it.each([
  { id: 'sub_1', status: 'canceled', customer: 'cus_1' },
  { id: 'sub_1', status: 'active', customer: 'another_customer' },
])('withholds the portal for an ineligible subscription', async (subscription) => {
  mocks.retrieve.mockResolvedValue(subscription);
  await expect(createStripeBillingPortalSession('user-1')).rejects.toThrow(/new purchases/);
  expect(mocks.create).not.toHaveBeenCalled();
});

it('keeps the ordinary management portal when shutdown mode is off', async () => {
  vi.stubEnv('SHUTDOWN_MODE', 'false');
  await createStripeBillingPortalSession('user-1');
  expect(mocks.create).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'https://example.test/account' });
});
