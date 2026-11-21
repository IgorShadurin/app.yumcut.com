import { getShutdownDate } from '@/server/shutdown-mode';
import { ok } from '@/server/http';
import { SUBSCRIPTION_PLAN_ORDER, getSubscriptionPlanByKey } from '@/shared/constants/subscriptions';
import type { MobilePaywallConfigDTO } from '@/shared/types';

export function GET() {
  const shutdownDate = getShutdownDate();
  if (shutdownDate) {
    return ok({ plans: [], purchasesEnabled: false, shutdownDate }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const payload: MobilePaywallConfigDTO = {
    plans: SUBSCRIPTION_PLAN_ORDER.map((planKey) => {
      const plan = getSubscriptionPlanByKey(planKey);
      return {
        planKey: plan.planKey,
        productId: plan.productId,
        interval: plan.interval,
        tokens: plan.tokens,
        maxValues: plan.maxValues,
      };
    }),
  };

  return ok(payload, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
