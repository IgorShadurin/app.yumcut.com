import { assertPurchasesOpen } from '@/server/shutdown-mode';
import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { error, ok, unauthorized } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { createStripeCheckoutSession, switchStripeSubscriptionPlan } from '@/server/stripe/subscriptions';
import { isStripePricingConfigured } from '@/server/stripe/client';
import { getUserSubscriptionStatus, isStripeSubscriptionEnvironment } from '@/server/subscriptions';
import type { SubscriptionPlanKey } from '@/shared/constants/subscriptions';

type CheckoutBody = {
  plan?: SubscriptionPlanKey;
};

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  const userId = user?.id;
  if (!userId) return unauthorized();
  assertPurchasesOpen();

  if (!isStripePricingConfigured()) {
    return error('CONFIG_ERROR', 'Stripe subscriptions are not configured.', 500);
  }

  const body = (await req.json().catch(() => null)) as CheckoutBody | null;
  const plan = body?.plan;
  if (plan !== 'weekly' && plan !== 'monthly' && plan !== 'monthly_pro') {
    return error('VALIDATION_ERROR', 'Plan must be one of: "weekly", "monthly", "monthly_pro".', 400);
  }

  const currentSubscription = await getUserSubscriptionStatus(userId);
  if (currentSubscription.active) {
    if (!isStripeSubscriptionEnvironment(currentSubscription.environment)) {
      return error(
        'NON_STRIPE_SUBSCRIPTION_ACTIVE',
        'You already have an active subscription from another platform. Manage or cancel it there before switching web billing.',
        409,
      );
    }
    const switched = await switchStripeSubscriptionPlan({
      userId,
      targetPlanKey: plan,
    });
    return ok(switched);
  }

  const checkout = await createStripeCheckoutSession({
    userId,
    userEmail: user?.email ?? null,
    planKey: plan,
  });

  return ok({
    action: 'checkout' as const,
    url: checkout.url,
    sessionId: checkout.sessionId,
  });
}, 'Failed to create subscription checkout session');
