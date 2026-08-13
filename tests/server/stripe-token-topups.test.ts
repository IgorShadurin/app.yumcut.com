import { beforeEach, describe, expect, it, vi } from 'vitest';

const userFindUnique = vi.fn();
const purchaseFindUnique = vi.fn();
const purchaseCreate = vi.fn();
const userUpdate = vi.fn();
const tokenTransactionCreate = vi.fn();
const checkoutCreate = vi.fn();
const listLineItems = vi.fn();

const transactionClient = {
  tokenTopUpPurchase: { create: purchaseCreate },
  user: { update: userUpdate },
  tokenTransaction: { create: tokenTransactionCreate },
};

vi.mock('@/server/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    tokenTopUpPurchase: { findUnique: purchaseFindUnique },
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
  },
}));

vi.mock('@/server/config', () => ({
  config: {
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_example',
    STRIPE_TOP_UP_75_PRICE_ID: 'price_75',
    STRIPE_TOP_UP_750_PRICE_ID: 'price_750',
    STRIPE_TOP_UP_1500_PRICE_ID: 'price_1500',
    STRIPE_TOP_UP_SUCCESS_PATH: '/account?topup=success',
    STRIPE_TOP_UP_CANCEL_PATH: '/account?topup=cancelled',
    NEXTAUTH_URL: 'https://app.example.com',
  },
}));

vi.mock('@/server/stripe/client', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: checkoutCreate, listLineItems } },
  }),
}));
vi.mock('@/server/stripe/subscription-logger', () => ({ logStripeSubscriptionEvent: vi.fn() }));

const {
  createStripeTokenTopUpCheckoutSession,
  getTokenTopUpPurchaseStatus,
  processPaidStripeTokenTopUpSession,
} = await import('@/server/stripe/token-topups');

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', deleted: false });
  purchaseFindUnique.mockResolvedValue(null);
  userUpdate.mockResolvedValue({ tokenBalance: 825 });
  checkoutCreate.mockResolvedValue({ id: 'cs_checkout', url: 'https://checkout.stripe.test/cs_checkout' });
  listLineItems.mockResolvedValue({
    data: [{ price: { id: 'price_750' }, quantity: 1 }],
  });
});

describe('Stripe token top-ups', () => {
  it('creates payment-mode Checkout with the server-selected price and ownership metadata', async () => {
    const result = await createStripeTokenTopUpCheckoutSession({
      userId: 'user-1',
      userEmail: 'user@example.com',
      packageKey: 'standard',
    });

    expect(result).toEqual({ url: 'https://checkout.stripe.test/cs_checkout', sessionId: 'cs_checkout' });
    expect(checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      client_reference_id: 'user-1',
      line_items: [{ price: 'price_750', quantity: 1 }],
      metadata: expect.objectContaining({
        purpose: 'token_top_up',
        userId: 'user-1',
        packageKey: 'standard',
        tokens: '750',
      }),
    }));
  });

  it('credits a paid package exactly through the ledger transaction', async () => {
    const result = await processPaidStripeTokenTopUpSession({
      id: 'cs_paid',
      payment_status: 'paid',
      amount_total: 1999,
      currency: 'usd',
      livemode: true,
      client_reference_id: 'user-1',
      customer: 'cus_1',
      payment_intent: 'pi_1',
      metadata: { purpose: 'token_top_up', userId: 'user-1', packageKey: 'standard' },
    } as never, 'evt_1');

    expect(result).toEqual(expect.objectContaining({ alreadyProcessed: false, tokensGranted: 750, balance: 825 }));
    expect(purchaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        stripeCheckoutSessionId: 'cs_paid',
        stripePaymentIntentId: 'pi_1',
        stripePriceId: 'price_750',
        tokens: 750,
        amountTotal: 1999,
      }),
    });
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { tokenBalance: { increment: 750 } },
    }));
    expect(tokenTransactionCreate).toHaveBeenCalledTimes(1);
  });

  it('does not grant again when the Checkout session was already processed', async () => {
    purchaseFindUnique.mockResolvedValue({ userId: 'user-1' });

    const result = await processPaidStripeTokenTopUpSession({
      id: 'cs_paid',
      payment_status: 'paid',
      amount_total: 1999,
      currency: 'usd',
      livemode: true,
      metadata: { purpose: 'token_top_up', userId: 'user-1', packageKey: 'standard' },
    } as never, 'evt_retry');

    expect(result).toEqual(expect.objectContaining({ alreadyProcessed: true, tokensGranted: 0 }));
    expect(purchaseCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects an amount that does not match the selected package', async () => {
    await expect(processPaidStripeTokenTopUpSession({
      id: 'cs_bad',
      payment_status: 'paid',
      amount_total: 1,
      currency: 'usd',
      livemode: true,
      metadata: { purpose: 'token_top_up', userId: 'user-1', packageKey: 'standard' },
    } as never, 'evt_bad')).rejects.toThrow('amount or currency');
    expect(purchaseCreate).not.toHaveBeenCalled();
  });

  it('does not disclose another user\'s purchase status', async () => {
    purchaseFindUnique.mockResolvedValue({ userId: 'user-2', tokens: 750, createdAt: new Date() });
    await expect(getTokenTopUpPurchaseStatus('user-1', 'cs_other')).resolves.toEqual({ status: 'pending' });
  });
});
