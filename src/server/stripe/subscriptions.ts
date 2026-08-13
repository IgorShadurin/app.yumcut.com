import type Stripe from 'stripe';
import { prisma } from '@/server/db';
import { config } from '@/server/config';
import { getStripeClient } from '@/server/stripe/client';
import { logStripeSubscriptionEvent } from '@/server/stripe/subscription-logger';
import { notifyAdminsOfSubscriptionCancellation } from '@/server/telegram';
import { markSubscriptionCancellationForWinback } from '@/server/subscription-winback';
import {
  getStripePriceIdForProductId,
  getSubscriptionConfig,
  getSubscriptionConfigByStripePriceId,
  getSubscriptionPlanByKey,
  SUBSCRIPTION_PLAN_ORDER,
  type SubscriptionPlanKey,
} from '@/shared/constants/subscriptions';
import {
  getUserSubscriptionStatus,
  processServerSubscriptionPurchase,
  type PurchaseSource,
} from '@/server/subscriptions';
import type { SubscriptionStatusDTO } from '@/shared/types';
import { processPaidStripeTokenTopUpSession } from '@/server/stripe/token-topups';

type StripePlanKey = SubscriptionPlanKey;

type AppUserProfile = {
  id: string;
  email: string | null;
  name: string | null;
  preferredLanguage: string | null;
};

function normalizeId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasConfigValue(value: string | null | undefined) {
  return normalizeId(value) !== null;
}

function readMetadataUserId(metadata: Stripe.Metadata | null | undefined) {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata.userId;
  if (typeof raw !== 'string') return null;
  return normalizeId(raw);
}

function extractPriceId(price: string | Stripe.Price | null | undefined) {
  if (!price) return null;
  if (typeof price === 'string') return normalizeId(price);
  return normalizeId(price.id);
}

function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
) {
  if (!customer) return null;
  if (typeof customer === 'string') return normalizeId(customer);
  if ('deleted' in customer && customer.deleted) return null;
  return normalizeId(customer.id);
}

function toStripeEnvironment(livemode: boolean) {
  return livemode ? 'StripeLive' : 'StripeTest';
}

function coerceUnixSecondsToDate(value: number | null | undefined, fallback = new Date()) {
  if (value === null || value === undefined) return fallback;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function resolveAppBaseUrl() {
  const base = config.NEXTAUTH_URL?.trim();
  if (!base) {
    throw new Error('NEXTAUTH_URL must be configured for Stripe checkout.');
  }
  return new URL(base).origin;
}

function resolveAbsoluteAppUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = resolveAppBaseUrl();
  return new URL(pathOrUrl, base).toString();
}

function buildStripeSuccessUrl() {
  const successUrl = new URL(resolveAbsoluteAppUrl(config.STRIPE_BILLING_SUCCESS_PATH));
  if (!successUrl.searchParams.has('session_id')) {
    successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  }
  return successUrl.toString();
}

function buildStripeCancelUrl() {
  return resolveAbsoluteAppUrl(config.STRIPE_BILLING_CANCEL_PATH);
}

function buildStripePortalReturnUrl() {
  return resolveAbsoluteAppUrl(config.STRIPE_BILLING_PORTAL_RETURN_PATH);
}

async function createBillingPortalSessionForCustomer(input: {
  userId: string;
  customerId: string;
  reason: string;
}) {
  const stripe = getStripeClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: buildStripePortalReturnUrl(),
  });

  logStripeSubscriptionEvent('portal_created', {
    userId: input.userId,
    customerId: input.customerId,
    reason: input.reason,
  });

  return {
    url: portal.url,
  };
}

function getPlanConfigByKey(planKey: StripePlanKey) {
  return getSubscriptionPlanByKey(planKey);
}

function requirePriceIdForPlan(planKey: StripePlanKey) {
  const plan = getPlanConfigByKey(planKey);
  const priceId = getStripePriceIdForProductId(plan.productId);
  if (!priceId) {
    throw new Error(`Stripe price ID for ${planKey} plan is not configured.`);
  }
  return {
    plan,
    priceId,
  };
}

async function findUserById(userId: string): Promise<AppUserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, preferredLanguage: true, deleted: true },
  });
  if (!user || user.deleted) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    preferredLanguage: user.preferredLanguage,
  };
}

function extractCustomerIdFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const raw = (payload as Record<string, unknown>).customerId;
  return typeof raw === 'string' ? normalizeId(raw) : null;
}

async function findCustomerIdFromPurchaseHistory(userId: string) {
  const rows = await prisma.subscriptionPurchase.findMany({
    where: {
      userId,
      originalTransactionId: {
        startsWith: 'sub_',
      },
    },
    orderBy: {
      purchaseDate: 'desc',
    },
    take: 25,
    select: {
      payload: true,
    },
  });

  for (const row of rows) {
    const customerId = extractCustomerIdFromPayload(row.payload);
    if (customerId) return customerId;
  }

  return null;
}

async function findLatestStripeSubscriptionId(userId: string) {
  const latest = await prisma.subscriptionPurchase.findFirst({
    where: {
      userId,
      originalTransactionId: {
        startsWith: 'sub_',
      },
    },
    orderBy: [{ expiresDate: 'desc' }, { purchaseDate: 'desc' }],
    select: {
      originalTransactionId: true,
    },
  });
  if (!latest) return null;
  return normalizeId(latest.originalTransactionId);
}

async function findCustomerIdFromLatestStripeSubscription(userId: string) {
  const stripe = getStripeClient();
  const subscriptionId = await findLatestStripeSubscriptionId(userId);
  if (!subscriptionId) return null;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return extractCustomerId(subscription.customer);
  } catch (error) {
    logStripeSubscriptionEvent('portal_customer_lookup_failed', {
      userId,
      subscriptionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function getSubscriptionCurrentPeriodEndUnix(subscription: Stripe.Subscription) {
  const values = subscription.items.data
    .map((item) => (typeof item.current_period_end === 'number' ? item.current_period_end : null))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function mapStripeCancellationState(subscription: Stripe.Subscription) {
  const currentPeriodEnd = getSubscriptionCurrentPeriodEndUnix(subscription);
  const hasScheduledCancellation =
    subscription.cancel_at_period_end === true || subscription.cancel_at !== null;
  const effectiveUnix =
    subscription.cancel_at ??
    (hasScheduledCancellation ? currentPeriodEnd : null) ??
    null;
  return {
    cancelAtPeriodEnd: hasScheduledCancellation,
    cancellationEffectiveAt:
      hasScheduledCancellation && effectiveUnix !== null
        ? coerceUnixSecondsToDate(effectiveUnix).toISOString()
        : null,
  };
}

function isStripeSubscriptionActiveLike(status: Stripe.Subscription.Status) {
  return (
    status === 'active' ||
    status === 'trialing' ||
    status === 'past_due' ||
    status === 'unpaid' ||
    status === 'incomplete'
  );
}

function stripeSubscriptionSortTimestamp(subscription: Stripe.Subscription) {
  const currentPeriodEnd = getSubscriptionCurrentPeriodEndUnix(subscription);
  return (
    currentPeriodEnd ??
    subscription.cancel_at ??
    subscription.canceled_at ??
    subscription.created ??
    0
  );
}

function pickBestSubscriptionCandidate(
  subscriptions: Stripe.Subscription[],
  expectedProductId: string | null,
  expectedSubscriptionId: string | null,
) {
  if (subscriptions.length === 0) return null;
  const sorted = [...subscriptions].sort((left, right) => {
    const leftMatchesSubId = Boolean(expectedSubscriptionId && left.id === expectedSubscriptionId);
    const rightMatchesSubId = Boolean(expectedSubscriptionId && right.id === expectedSubscriptionId);
    if (leftMatchesSubId !== rightMatchesSubId) return leftMatchesSubId ? -1 : 1;

    const leftPlan = getPlanFromSubscription(left)?.plan;
    const rightPlan = getPlanFromSubscription(right)?.plan;
    const leftMatches = Boolean(expectedProductId && leftPlan?.productId === expectedProductId);
    const rightMatches = Boolean(expectedProductId && rightPlan?.productId === expectedProductId);
    if (leftMatches !== rightMatches) return leftMatches ? -1 : 1;

    const leftActiveLike = isStripeSubscriptionActiveLike(left.status);
    const rightActiveLike = isStripeSubscriptionActiveLike(right.status);
    if (leftActiveLike !== rightActiveLike) return leftActiveLike ? -1 : 1;

    const leftTs = stripeSubscriptionSortTimestamp(left);
    const rightTs = stripeSubscriptionSortTimestamp(right);
    if (leftTs !== rightTs) return rightTs - leftTs;
    return (right.created ?? 0) - (left.created ?? 0);
  });
  return sorted[0] ?? null;
}

async function getStripeCancellationStatus(userId: string, expectedProductId: string | null) {
  const stripe = getStripeClient();
  const expectedSubscriptionId = await findLatestStripeSubscriptionId(userId);
  const latestInvoice = await prisma.subscriptionPurchase.findFirst({
    where: {
      userId,
      transactionId: {
        startsWith: 'in_',
      },
    },
    orderBy: [{ expiresDate: 'desc' }, { purchaseDate: 'desc' }],
    select: {
      transactionId: true,
    },
  });
  const latestInvoiceId = normalizeId(latestInvoice?.transactionId);

  if (latestInvoiceId) {
    try {
      const invoice = await stripe.invoices.retrieve(latestInvoiceId);
      const invoiceSubscriptionId = getSubscriptionIdFromInvoice(invoice as Stripe.Invoice);
      if (invoiceSubscriptionId) {
        const invoiceSubscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
        const invoicePlan = getPlanFromSubscription(invoiceSubscription)?.plan;
        const planMatches = !expectedProductId || invoicePlan?.productId === expectedProductId;
        if (planMatches) {
          return mapStripeCancellationState(invoiceSubscription);
        }
      }
    } catch (error) {
      logStripeSubscriptionEvent('cancellation_status_invoice_lookup_failed', {
        userId,
        latestInvoiceId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (expectedSubscriptionId) {
    try {
      const direct = await stripe.subscriptions.retrieve(expectedSubscriptionId);
      const directPlan = getPlanFromSubscription(direct)?.plan;
      const planMatches = !expectedProductId || directPlan?.productId === expectedProductId;
      if (planMatches) {
        return mapStripeCancellationState(direct);
      }
    } catch (error) {
      logStripeSubscriptionEvent('cancellation_status_direct_lookup_failed', {
        userId,
        subscriptionId: expectedSubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const customerId =
    (await findCustomerIdFromPurchaseHistory(userId)) ??
    (await findCustomerIdFromLatestStripeSubscription(userId));

  if (customerId) {
    try {
      const listed = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 20,
      });
      const candidate = pickBestSubscriptionCandidate(listed.data, expectedProductId, expectedSubscriptionId);
      if (candidate) return mapStripeCancellationState(candidate);
    } catch (error) {
      logStripeSubscriptionEvent('cancellation_status_list_failed', {
        userId,
        customerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const subscriptionId = expectedSubscriptionId;
  if (!subscriptionId) {
    return {
      cancelAtPeriodEnd: false,
      cancellationEffectiveAt: null as string | null,
    };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return mapStripeCancellationState(subscription);
  } catch (error) {
    logStripeSubscriptionEvent('cancellation_status_lookup_failed', {
      userId,
      subscriptionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      cancelAtPeriodEnd: false,
      cancellationEffectiveAt: null as string | null,
    };
  }
}

async function resolveUserIdFromStripeCustomer(customerId: string | null) {
  if (!customerId) return null;
  const stripe = getStripeClient();
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) return null;
    return readMetadataUserId(customer.metadata);
  } catch (error) {
    logStripeSubscriptionEvent('customer_user_lookup_failed', {
      customerId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function resolveUserFromStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null,
): Promise<AppUserProfile | null> {
  const metadataUserId = readMetadataUserId(subscription.metadata);
  if (metadataUserId) {
    return findUserById(metadataUserId);
  }

  const normalizedFallback = normalizeId(fallbackUserId);
  if (normalizedFallback) {
    const fallbackUser = await findUserById(normalizedFallback);
    if (fallbackUser) return fallbackUser;
  }

  const knownOwner = await prisma.subscriptionPurchase.findFirst({
    where: {
      originalTransactionId: subscription.id,
    },
    orderBy: {
      purchaseDate: 'desc',
    },
    select: {
      userId: true,
    },
  });
  if (knownOwner?.userId) {
    const owner = await findUserById(knownOwner.userId);
    if (owner) return owner;
  }

  const customerId = extractCustomerId(subscription.customer);
  const customerUserId = await resolveUserIdFromStripeCustomer(customerId);
  if (!customerUserId) return null;
  return findUserById(customerUserId);
}

function getPlanFromInvoice(invoice: Stripe.Invoice) {
  for (const line of invoice.lines.data) {
    const priceId = extractPriceId(line.pricing?.price_details?.price);
    const resolved = getSubscriptionConfigByStripePriceId(priceId);
    if (!resolved || !priceId) continue;

    return {
      plan: resolved.plan,
      tokens: resolved.tokens,
      priceId,
      line,
    };
  }

  const productIdFromSnapshot = normalizeId(invoice.parent?.subscription_details?.metadata?.productId);
  const planFromSnapshot = getSubscriptionConfig(productIdFromSnapshot);
  if (planFromSnapshot) {
    return {
      plan: planFromSnapshot,
      priceId: getStripePriceIdForProductId(planFromSnapshot.productId),
      line: null,
    };
  }

  return null;
}

function getPlanFromSubscription(subscription: Stripe.Subscription) {
  for (const item of subscription.items.data) {
    const priceId = extractPriceId(item.price);
    const resolved = getSubscriptionConfigByStripePriceId(priceId);
    if (!resolved || !priceId) continue;
    return {
      plan: resolved.plan,
      tokens: resolved.tokens,
      priceId,
    };
  }
  return null;
}

function shouldTreatAsRenewal(invoice: Stripe.Invoice): PurchaseSource {
  return invoice.billing_reason === 'subscription_cycle' ? 'auto_renew' : 'user_purchase';
}

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice) {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === 'string') {
    return normalizeId(parentSubscription);
  }
  if (parentSubscription && typeof parentSubscription === 'object') {
    return normalizeId(parentSubscription.id);
  }

  for (const line of invoice.lines.data) {
    if (typeof line.subscription === 'string') {
      return normalizeId(line.subscription);
    }
    if (line.subscription && typeof line.subscription === 'object') {
      return normalizeId(line.subscription.id);
    }
    const parentLineSubscription = line.parent?.subscription_item_details?.subscription;
    if (typeof parentLineSubscription === 'string') {
      return normalizeId(parentLineSubscription);
    }
  }

  return null;
}

async function processInvoicePaymentSucceeded(invoice: Stripe.Invoice, eventId: string) {
  const invoiceId = normalizeId(invoice.id);
  const subscriptionId = getSubscriptionIdFromInvoice(invoice);

  if (!invoiceId || !subscriptionId) {
    logStripeSubscriptionEvent('invoice_skipped_missing_ids', {
      eventId,
      invoiceId,
      subscriptionId,
    });
    return;
  }

  if (invoice.status !== 'paid' || typeof invoice.amount_paid !== 'number' || invoice.amount_paid <= 0) {
    logStripeSubscriptionEvent('invoice_skipped_not_paid', {
      eventId,
      invoiceId,
      subscriptionId,
      status: invoice.status ?? null,
      amountPaid: invoice.amount_paid ?? null,
    });
    return;
  }

  const planSelection = getPlanFromInvoice(invoice);
  if (!planSelection) {
    logStripeSubscriptionEvent('invoice_skipped_unknown_price', {
      eventId,
      invoiceId,
      subscriptionId,
    });
    return;
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const fallbackUserId =
    readMetadataUserId(invoice.metadata) ||
    readMetadataUserId(subscription.metadata);
  const user = await resolveUserFromStripeSubscription(subscription, fallbackUserId);
  if (!user) {
    logStripeSubscriptionEvent('invoice_skipped_user_not_found', {
      eventId,
      invoiceId,
      subscriptionId,
      customerId: extractCustomerId(invoice.customer),
    });
    return;
  }

  const source = shouldTreatAsRenewal(invoice);
  const purchaseDate = coerceUnixSecondsToDate(
    invoice.status_transitions?.paid_at ?? invoice.created ?? undefined,
  );
  const expiresDate = coerceUnixSecondsToDate(
    planSelection.line?.period?.end ?? invoice.period_end ?? undefined,
    purchaseDate,
  );
  const customerId = extractCustomerId(invoice.customer);

  const result = await processServerSubscriptionPurchase({
    userId: user.id,
    productId: planSelection.plan.productId,
    transactionId: invoiceId,
    originalTransactionId: subscriptionId,
    purchaseDate,
    expiresDate,
    environment: toStripeEnvironment(invoice.livemode),
    tokensOverride: planSelection.tokens,
    source,
    payload: {
      source: 'stripe_invoice',
      eventId,
      invoiceId,
      invoiceNumber: invoice.number ?? null,
      customerId,
      subscriptionId,
      priceId: planSelection.priceId,
      billingReason: invoice.billing_reason ?? null,
      amountPaid: invoice.amount_paid ?? null,
      currency: invoice.currency ?? null,
      periodStart: planSelection.line?.period?.start ?? invoice.period_start ?? null,
      periodEnd: planSelection.line?.period?.end ?? invoice.period_end ?? null,
      livemode: invoice.livemode,
    },
  });

  logStripeSubscriptionEvent('invoice_processed', {
    eventId,
    invoiceId,
    subscriptionId,
    userId: user.id,
    productId: result.productId,
    tokensGranted: result.tokensGranted,
    balance: result.balance,
    alreadyProcessed: result.alreadyProcessed,
    source,
    expiresAt: result.expiresAt,
  });
}

async function notifyStripeCancellation(
  subscription: Stripe.Subscription,
  eventId: string,
  reason: string,
) {
  const user = await resolveUserFromStripeSubscription(subscription);
  if (!user) {
    logStripeSubscriptionEvent('cancellation_skipped_user_not_found', {
      eventId,
      subscriptionId: subscription.id,
      reason,
    });
    return;
  }

  const planSelection = getPlanFromSubscription(subscription);
  const fallbackProductId = normalizeId(subscription.metadata.productId) ?? 'unknown';
  const productId = planSelection?.plan.productId ?? fallbackProductId;
  const productConfig = getSubscriptionConfig(productId);

  await notifyAdminsOfSubscriptionCancellation({
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    productId,
    productLabel: productConfig?.label ?? productId,
    transactionId:
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id ?? null,
    originalTransactionId: subscription.id,
    environment: toStripeEnvironment(subscription.livemode),
    reason,
    autoRenewStatus: subscription.cancel_at_period_end ? 0 : 1,
  });

  const winbackResult = await markSubscriptionCancellationForWinback({
    userId: user.id,
    email: user.email,
    name: user.name,
    preferredLanguage: user.preferredLanguage,
    productId,
  });

  logStripeSubscriptionEvent('cancellation_notified', {
    eventId,
    subscriptionId: subscription.id,
    userId: user.id,
    productId,
    reason,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    winbackMarked: winbackResult.marked,
    winbackEmailSent: winbackResult.emailSent,
    winbackEmailError: winbackResult.emailError,
  });
}

async function processSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string) {
  await notifyStripeCancellation(subscription, eventId, 'deleted');
}

async function processSubscriptionUpdated(
  subscription: Stripe.Subscription,
  previousAttributes: Record<string, unknown> | undefined,
  eventId: string,
) {
  const hadPreviousFlag =
    previousAttributes &&
    Object.prototype.hasOwnProperty.call(previousAttributes, 'cancel_at_period_end');
  const wasCancelAtPeriodEnd = hadPreviousFlag
    ? Boolean((previousAttributes as { cancel_at_period_end?: unknown }).cancel_at_period_end)
    : null;
  const becameCancelAtPeriodEnd = subscription.cancel_at_period_end === true;

  if (!hadPreviousFlag || wasCancelAtPeriodEnd !== false || !becameCancelAtPeriodEnd) {
    return;
  }

  await notifyStripeCancellation(subscription, eventId, 'cancel_at_period_end');
}

function pickSubscriptionItemForPlanSwitch(subscription: Stripe.Subscription) {
  if (subscription.items.data.length === 0) return null;
  const ranked = [...subscription.items.data].sort((left, right) => {
    const leftKnown = Boolean(getSubscriptionConfigByStripePriceId(extractPriceId(left.price)));
    const rightKnown = Boolean(getSubscriptionConfigByStripePriceId(extractPriceId(right.price)));
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    return (right.created ?? 0) - (left.created ?? 0);
  });
  return ranked[0] ?? null;
}

async function findStripeSubscriptionForUser(userId: string) {
  const stripe = getStripeClient();
  const expectedSubscriptionId = await findLatestStripeSubscriptionId(userId);
  if (expectedSubscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(expectedSubscriptionId);
    } catch (error) {
      logStripeSubscriptionEvent('switch_direct_lookup_failed', {
        userId,
        subscriptionId: expectedSubscriptionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const customerId =
    (await findCustomerIdFromPurchaseHistory(userId)) ??
    (await findCustomerIdFromLatestStripeSubscription(userId));
  if (!customerId) return null;

  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
  });
  const candidate = pickBestSubscriptionCandidate(listed.data, null, expectedSubscriptionId);
  return candidate ?? null;
}

export type StripeAccountDeletionCancellationResult =
  | {
      ok: true;
      action: 'no_stripe_subscription' | 'already_cancelled' | 'cancelled_at_period_end';
      subscriptionId?: string | null;
      cancellationEffectiveAt?: string | null;
    }
  | {
      ok: false;
      action: 'manual_cancellation_required';
      message: string;
      subscriptionId?: string | null;
      portalUrl?: string | null;
    };

export async function cancelStripeSubscriptionForAccountDeletion(
  userId: string,
): Promise<StripeAccountDeletionCancellationResult> {
  const expectedSubscriptionId = await findLatestStripeSubscriptionId(userId);
  const knownCustomerId = await findCustomerIdFromPurchaseHistory(userId);
  if (!expectedSubscriptionId && !knownCustomerId) {
    return { ok: true, action: 'no_stripe_subscription' };
  }

  if (!hasConfigValue(config.STRIPE_SECRET_KEY)) {
    return {
      ok: false,
      action: 'manual_cancellation_required',
      message: 'Stripe is not configured, so the web subscription could not be cancelled automatically.',
      subscriptionId: expectedSubscriptionId,
      portalUrl: null,
    };
  }

  const stripe = getStripeClient();
  let subscription: Stripe.Subscription | null = null;
  try {
    subscription = await findStripeSubscriptionForUser(userId);
  } catch (error) {
    logStripeSubscriptionEvent('account_deletion_subscription_lookup_failed', {
      userId,
      subscriptionId: expectedSubscriptionId,
      customerId: knownCustomerId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (!subscription) {
    return { ok: true, action: 'no_stripe_subscription' };
  }

  if (
    !isStripeSubscriptionActiveLike(subscription.status) ||
    subscription.cancel_at_period_end === true ||
    subscription.cancel_at !== null
  ) {
    const cancellationState = mapStripeCancellationState(subscription);
    return {
      ok: true,
      action: 'already_cancelled',
      subscriptionId: subscription.id,
      cancellationEffectiveAt: cancellationState.cancellationEffectiveAt,
    };
  }

  try {
    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
      metadata: {
        ...subscription.metadata,
        userId,
        accountDeletionRequestedAt: new Date().toISOString(),
      },
    });
    const cancellationState = mapStripeCancellationState(updated);
    if (updated.cancel_at_period_end === true || updated.cancel_at !== null) {
      logStripeSubscriptionEvent('account_deletion_subscription_cancelled', {
        userId,
        subscriptionId: updated.id,
        status: updated.status,
        cancellationEffectiveAt: cancellationState.cancellationEffectiveAt,
      });
      return {
        ok: true,
        action: 'cancelled_at_period_end',
        subscriptionId: updated.id,
        cancellationEffectiveAt: cancellationState.cancellationEffectiveAt,
      };
    }

    logStripeSubscriptionEvent('account_deletion_subscription_not_cancelled', {
      userId,
      subscriptionId: updated.id,
      status: updated.status,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
      cancelAt: updated.cancel_at,
    });
  } catch (error) {
    logStripeSubscriptionEvent('account_deletion_subscription_cancel_failed', {
      userId,
      subscriptionId: subscription.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const customerId = extractCustomerId(subscription.customer) ?? knownCustomerId;
  let portalUrl: string | null = null;
  if (customerId) {
    try {
      const portal = await createBillingPortalSessionForCustomer({
        userId,
        customerId,
        reason: 'account_deletion_cancel_failed',
      });
      portalUrl = portal.url;
    } catch (error) {
      logStripeSubscriptionEvent('account_deletion_portal_failed', {
        userId,
        subscriptionId: subscription.id,
        customerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: false,
    action: 'manual_cancellation_required',
    message:
      'Your Stripe subscription could not be cancelled automatically. Cancel it in Stripe Billing Portal before deleting the account.',
    subscriptionId: subscription.id,
    portalUrl,
  };
}

export async function switchStripeSubscriptionPlan(input: {
  userId: string;
  targetPlanKey: StripePlanKey;
}) {
  const stripe = getStripeClient();
  const { plan: targetPlan, priceId: targetPriceId } = requirePriceIdForPlan(input.targetPlanKey);
  const subscription = await findStripeSubscriptionForUser(input.userId);
  if (!subscription) {
    throw new Error('No active Stripe subscription found for this account.');
  }

  if (!isStripeSubscriptionActiveLike(subscription.status)) {
    throw new Error(`Subscription is not active (status: ${subscription.status}).`);
  }

  const currentPlan = getPlanFromSubscription(subscription);
  if (currentPlan?.priceId === targetPriceId) {
    return {
      action: 'already_on_plan' as const,
      subscriptionId: subscription.id,
      planKey: targetPlan.planKey,
    };
  }

  const item = pickSubscriptionItemForPlanSwitch(subscription);
  if (!item?.id) {
    throw new Error('No Stripe subscription item found to update.');
  }

  const updated = await stripe.subscriptions.update(subscription.id, {
    items: [
      {
        id: item.id,
        price: targetPriceId,
        quantity: item.quantity ?? 1,
      },
    ],
    metadata: {
      ...subscription.metadata,
      userId: input.userId,
      productId: targetPlan.productId,
      planKey: targetPlan.planKey,
    },
    billing_cycle_anchor: 'unchanged',
    proration_behavior: 'none',
    payment_behavior: 'allow_incomplete',
  });

  logStripeSubscriptionEvent('subscription_plan_switched', {
    userId: input.userId,
    subscriptionId: updated.id,
    targetPlanKey: targetPlan.planKey,
    targetProductId: targetPlan.productId,
    targetPriceId,
    sourceSubscriptionId: subscription.id,
    previousProductId: currentPlan?.plan.productId ?? null,
    previousPriceId: currentPlan?.priceId ?? null,
  });

  return {
    action: 'switched' as const,
    subscriptionId: updated.id,
    planKey: targetPlan.planKey,
  };
}

export async function createStripeCheckoutSession(input: {
  userId: string;
  userEmail: string | null;
  planKey: StripePlanKey;
}) {
  const stripe = getStripeClient();
  const { plan, priceId } = requirePriceIdForPlan(input.planKey);
  const existingCustomerId = await findCustomerIdFromPurchaseHistory(input.userId);

  const basePayload: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    success_url: buildStripeSuccessUrl(),
    cancel_url: buildStripeCancelUrl(),
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: input.userId,
    metadata: {
      userId: input.userId,
      productId: plan.productId,
      planKey: plan.planKey,
    },
    subscription_data: {
      metadata: {
        userId: input.userId,
        productId: plan.productId,
        planKey: plan.planKey,
      },
    },
    allow_promotion_codes: true,
  };

  if (existingCustomerId) {
    basePayload.customer = existingCustomerId;
  } else if (input.userEmail) {
    basePayload.customer_email = input.userEmail;
  }

  const session = await stripe.checkout.sessions.create(basePayload);
  if (!session.url) {
    throw new Error('Stripe checkout session is missing redirect URL.');
  }

  logStripeSubscriptionEvent('checkout_created', {
    userId: input.userId,
    sessionId: session.id,
    planKey: input.planKey,
    productId: plan.productId,
    priceId,
    existingCustomerId: existingCustomerId ?? null,
  });

  return {
    url: session.url,
    sessionId: session.id,
  };
}

export async function createStripeBillingPortalSession(userId: string) {
  const customerId =
    (await findCustomerIdFromPurchaseHistory(userId)) ??
    (await findCustomerIdFromLatestStripeSubscription(userId));

  if (!customerId) {
    throw new Error('No Stripe customer found for this account.');
  }

  const portal = await createBillingPortalSessionForCustomer({
    userId,
    customerId,
    reason: 'manage_billing',
  });

  return {
    url: portal.url,
  };
}

export async function getWebSubscriptionStatus(userId: string): Promise<SubscriptionStatusDTO> {
  const baseStatus = await getUserSubscriptionStatus(userId);
  const plans = SUBSCRIPTION_PLAN_ORDER.map((planKey) => {
    const plan = getPlanConfigByKey(planKey);
    return {
      planKey: plan.planKey,
      productId: plan.productId,
      label: plan.label,
      interval: plan.interval,
      priceUsd: plan.priceUsd,
      tokens: plan.tokens,
      maxValues: plan.maxValues,
      benefits: plan.ui.benefits,
      configured: Boolean(getStripePriceIdForProductId(plan.productId)),
    };
  });

  const stripeReady =
    Boolean(
      hasConfigValue(config.STRIPE_SECRET_KEY) &&
        hasConfigValue(config.STRIPE_WEBHOOK_SECRET) &&
        hasConfigValue(config.NEXTAUTH_URL),
    ) && plans.every((plan) => plan.configured);
  const canManageBilling = stripeReady
    ? Boolean(
        (await findCustomerIdFromPurchaseHistory(userId)) ??
          (await findCustomerIdFromLatestStripeSubscription(userId)),
      )
    : false;
  const cancellationStatus = stripeReady
    ? await getStripeCancellationStatus(userId, baseStatus.productId)
    : { cancelAtPeriodEnd: false, cancellationEffectiveAt: null as string | null };
  const cancellationEffectiveAt =
    cancellationStatus.cancellationEffectiveAt ??
    (cancellationStatus.cancelAtPeriodEnd ? baseStatus.expiresAt : null);

  return {
    ...baseStatus,
    cancelAtPeriodEnd: cancellationStatus.cancelAtPeriodEnd,
    cancellationEffectiveAt,
    plans,
    stripeReady,
    canManageBilling,
  };
}

export async function handleStripeWebhook(input: {
  signature: string | null;
  rawBody: string;
}) {
  const webhookSecret = config.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error('Stripe webhook secret is not configured.');
  }
  if (!input.signature) {
    throw new Error('Missing Stripe signature header.');
  }

  const stripe = getStripeClient();
  const event = stripe.webhooks.constructEvent(
    input.rawBody,
    input.signature,
    webhookSecret,
  );

  logStripeSubscriptionEvent('webhook_received', {
    eventId: event.id,
    type: event.type,
    livemode: event.livemode,
  });

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      await processPaidStripeTokenTopUpSession(event.data.object as Stripe.Checkout.Session, event.id);
      break;
    }
    case 'invoice.payment_succeeded': {
      await processInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, event.id);
      break;
    }
    case 'customer.subscription.deleted': {
      await processSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
      break;
    }
    case 'customer.subscription.updated': {
      await processSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes,
        event.id,
      );
      break;
    }
    default: {
      logStripeSubscriptionEvent('webhook_ignored', {
        eventId: event.id,
        type: event.type,
      });
    }
  }

  return { received: true };
}
