import { afterEach, describe, expect, it, vi } from 'vitest';

import { SUBSCRIPTION_PLAN_ORDER, getSubscriptionPlanByKey } from '@/shared/constants/subscriptions';

const route = await import('@/app/api/mobile/paywall-config/route');

describe('GET /api/mobile/paywall-config', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('withdraws all new offers and reports the last day of access', async () => {
    vi.stubEnv('SHUTDOWN_MODE', 'true');
    vi.stubEnv('SHUTDOWN_DATE', '2027-01-31');
    const res = route.GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ plans: [], purchasesEnabled: false, shutdownDate: '2027-01-31' });
  });

  it('returns public plan max values without auth', async () => {
    const res = route.GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('public');

    const payload = await res.json();
    expect(payload.plans).toEqual(
      SUBSCRIPTION_PLAN_ORDER.map((planKey) => {
        const plan = getSubscriptionPlanByKey(planKey);
        return {
          planKey: plan.planKey,
          productId: plan.productId,
          interval: plan.interval,
          tokens: plan.tokens,
          maxValues: plan.maxValues,
        };
      }),
    );
    expect(payload.plans.map((plan: any) => [plan.planKey, plan.maxValues.videos])).toEqual([
      ['weekly', 2.5],
      ['monthly', 25],
      ['monthly_pro', 50],
    ]);
  });
});
