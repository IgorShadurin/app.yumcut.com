import { NextRequest } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import { POST as subscribe } from '@/app/api/subscriptions/checkout/route';
import { POST as topUp } from '@/app/api/token-topups/checkout/route';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), checkout: vi.fn(), switchPlan: vi.fn(), topUp: vi.fn(), status: vi.fn(),
}));
vi.mock('@/server/auth', () => ({ getAuthSession: mocks.session }));
vi.mock('@/server/stripe/client', () => ({ isStripePricingConfigured: () => true }));
vi.mock('@/server/subscriptions', () => ({ getUserSubscriptionStatus: mocks.status, isStripeSubscriptionEnvironment: () => true }));
vi.mock('@/server/stripe/subscriptions', () => ({ createStripeCheckoutSession: mocks.checkout, switchStripeSubscriptionPlan: mocks.switchPlan }));
vi.mock('@/server/stripe/token-topups', () => ({ createStripeTokenTopUpCheckoutSession: mocks.topUp, isStripeTopUpConfigured: () => true }));

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const request = () => new NextRequest('http://localhost/', { method: 'POST', body: JSON.stringify({ plan: 'weekly', package: 'starter' }) });

it.each([subscribe, topUp])('rejects purchases before contacting Stripe when closed', async (route) => {
  vi.stubEnv('SHUTDOWN_MODE', '1');
  expect((await route(request())).status).toBe(401);
  mocks.session.mockResolvedValue({ user: { id: 'existing' } });
  const response = await route(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: 'PURCHASES_CLOSED' } });
  for (const mock of [mocks.checkout, mocks.topUp, mocks.switchPlan, mocks.status]) expect(mock).not.toHaveBeenCalled();
});

it('preserves normal checkout and plan switching with the flag off', async () => {
  vi.stubEnv('SHUTDOWN_MODE', 'false');
  mocks.session.mockResolvedValue({ user: { id: 'existing' } });
  mocks.status.mockResolvedValue({ active: false });
  mocks.checkout.mockResolvedValue({ url: 'https://checkout.example', sessionId: 'session' });
  expect(await (await subscribe(request())).json()).toMatchObject({ action: 'checkout' });
  mocks.status.mockResolvedValue({ active: true });
  mocks.switchPlan.mockResolvedValue({ action: 'switched' });
  expect(await (await subscribe(request())).json()).toMatchObject({ action: 'switched' });
  mocks.topUp.mockResolvedValue({ url: 'https://checkout.example' });
  expect((await topUp(request())).status).toBe(200);
  expect(mocks.topUp).toHaveBeenCalledOnce();
});
