import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthSession = vi.fn();
const createCheckout = vi.fn();
const getStatus = vi.fn();
const isConfigured = vi.fn();

vi.mock('@/server/auth', () => ({ getAuthSession }));
vi.mock('@/server/stripe/token-topups', () => ({
  createStripeTokenTopUpCheckoutSession: createCheckout,
  getTokenTopUpPurchaseStatus: getStatus,
  isStripeTopUpConfigured: isConfigured,
}));

const checkoutRoute = await import('@/app/api/token-topups/checkout/route');
const statusRoute = await import('@/app/api/token-topups/status/route');

beforeEach(() => {
  vi.clearAllMocks();
  getAuthSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } });
  isConfigured.mockReturnValue(true);
  createCheckout.mockResolvedValue({ url: 'https://checkout.stripe.test/cs_1', sessionId: 'cs_1' });
  getStatus.mockResolvedValue({ status: 'credited', tokens: 75, creditedAt: '2026-08-13T00:00:00.000Z' });
});

describe('token top-up routes', () => {
  it('requires authentication for checkout and status', async () => {
    getAuthSession.mockResolvedValue(null);
    const checkoutResponse = await checkoutRoute.POST(new NextRequest('http://localhost/api/token-topups/checkout', {
      method: 'POST',
      body: JSON.stringify({ package: 'starter' }),
    }));
    const statusResponse = await statusRoute.GET(new NextRequest('http://localhost/api/token-topups/status?session_id=cs_123'));
    expect(checkoutResponse.status).toBe(401);
    expect(statusResponse.status).toBe(401);
  });

  it('starts checkout only for an allowlisted package', async () => {
    const response = await checkoutRoute.POST(new NextRequest('http://localhost/api/token-topups/checkout', {
      method: 'POST',
      body: JSON.stringify({ package: 'standard' }),
    }));
    expect(response.status).toBe(200);
    expect(createCheckout).toHaveBeenCalledWith({
      userId: 'user-1',
      userEmail: 'user@example.com',
      packageKey: 'standard',
    });

    const invalid = await checkoutRoute.POST(new NextRequest('http://localhost/api/token-topups/checkout', {
      method: 'POST',
      body: JSON.stringify({ package: 'unlimited' }),
    }));
    expect(invalid.status).toBe(400);
  });

  it('scopes status lookup to the authenticated user', async () => {
    const response = await statusRoute.GET(new NextRequest('http://localhost/api/token-topups/status?session_id=cs_123'));
    expect(response.status).toBe(200);
    expect(getStatus).toHaveBeenCalledWith('user-1', 'cs_123');
  });
});
