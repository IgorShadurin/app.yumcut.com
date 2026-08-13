import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { prisma } from '@/server/db';
import { config } from '@/server/config';
import { getStripeClient } from '@/server/stripe/client';
import { logStripeSubscriptionEvent } from '@/server/stripe/subscription-logger';
import { grantTokens, makeSystemInitiator } from '@/server/tokens';
import { TOKEN_TRANSACTION_TYPES } from '@/shared/constants/token-costs';
import {
  TOKEN_TOP_UP_PACKAGE_ORDER,
  TOKEN_TOP_UP_PACKAGES,
  isTokenTopUpPackageKey,
  type TokenTopUpPackageKey,
} from '@/shared/constants/token-topups';

const TOP_UP_PURPOSE = 'token_top_up';

const PRICE_ENV_BY_PACKAGE: Record<TokenTopUpPackageKey, keyof typeof config> = {
  starter: 'STRIPE_TOP_UP_75_PRICE_ID',
  standard: 'STRIPE_TOP_UP_750_PRICE_ID',
  pro: 'STRIPE_TOP_UP_1500_PRICE_ID',
};

function normalizeString(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveAbsoluteAppUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = config.NEXTAUTH_URL?.trim();
  if (!base) throw new Error('NEXTAUTH_URL must be configured for Stripe checkout.');
  return new URL(pathOrUrl, new URL(base).origin).toString();
}

function buildTopUpSuccessUrl() {
  const successUrl = new URL(resolveAbsoluteAppUrl(config.STRIPE_TOP_UP_SUCCESS_PATH));
  if (!successUrl.searchParams.has('topup_session_id')) {
    successUrl.searchParams.set('topup_session_id', '{CHECKOUT_SESSION_ID}');
  }
  return successUrl.toString();
}

function getPaymentIntentId(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === 'string') return normalizeString(session.payment_intent);
  return normalizeString(session.payment_intent?.id);
}

export function getStripeTopUpPriceId(packageKey: TokenTopUpPackageKey) {
  const envKey = PRICE_ENV_BY_PACKAGE[packageKey];
  const value = config[envKey];
  return typeof value === 'string' ? normalizeString(value) : null;
}

export function getTokenTopUpPackagesForUi() {
  return TOKEN_TOP_UP_PACKAGE_ORDER.map((key) => ({
    ...TOKEN_TOP_UP_PACKAGES[key],
    configured: Boolean(getStripeTopUpPriceId(key)),
  }));
}

export function isStripeTopUpConfigured() {
  return Boolean(
    normalizeString(config.STRIPE_SECRET_KEY) &&
      normalizeString(config.STRIPE_WEBHOOK_SECRET) &&
      normalizeString(config.NEXTAUTH_URL) &&
      TOKEN_TOP_UP_PACKAGE_ORDER.every((key) => Boolean(getStripeTopUpPriceId(key))),
  );
}

export async function createStripeTokenTopUpCheckoutSession(input: {
  userId: string;
  userEmail: string | null;
  packageKey: TokenTopUpPackageKey;
}) {
  const priceId = getStripeTopUpPriceId(input.packageKey);
  if (!priceId) throw new Error(`Stripe price ID for ${input.packageKey} token top-up is not configured.`);

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, deleted: true },
  });
  if (!user || user.deleted) throw new Error('User not found.');

  const tokenPackage = TOKEN_TOP_UP_PACKAGES[input.packageKey];
  const metadata = {
    purpose: TOP_UP_PURPOSE,
    userId: user.id,
    packageKey: input.packageKey,
    tokens: String(tokenPackage.tokens),
  };
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: buildTopUpSuccessUrl(),
    cancel_url: resolveAbsoluteAppUrl(config.STRIPE_TOP_UP_CANCEL_PATH),
    client_reference_id: user.id,
    customer_creation: 'always',
    customer_email: normalizeString(input.userEmail) ?? normalizeString(user.email) ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    payment_intent_data: { metadata },
  });

  if (!session.url) throw new Error('Stripe checkout session is missing redirect URL.');

  logStripeSubscriptionEvent('top_up_checkout_created', {
    userId: user.id,
    checkoutSessionId: session.id,
    packageKey: input.packageKey,
    priceId,
    tokens: tokenPackage.tokens,
  });

  return { url: session.url, sessionId: session.id };
}

export async function processPaidStripeTokenTopUpSession(
  session: Stripe.Checkout.Session,
  eventId: string,
) {
  if (session.metadata?.purpose !== TOP_UP_PURPOSE) return { ignored: true as const };
  if (session.payment_status !== 'paid') {
    logStripeSubscriptionEvent('top_up_skipped_not_paid', {
      eventId,
      checkoutSessionId: session.id,
      paymentStatus: session.payment_status,
    });
    return { ignored: true as const };
  }

  const userId = normalizeString(session.metadata.userId) ?? normalizeString(session.client_reference_id);
  const packageKeyValue = session.metadata.packageKey;
  if (!userId || !isTokenTopUpPackageKey(packageKeyValue)) {
    throw new Error('Stripe token top-up session has invalid ownership metadata.');
  }

  const tokenPackage = TOKEN_TOP_UP_PACKAGES[packageKeyValue];
  const expectedPriceId = getStripeTopUpPriceId(packageKeyValue);
  if (!expectedPriceId) throw new Error(`Stripe price ID for ${packageKeyValue} token top-up is not configured.`);

  const expectedAmount = Math.round(tokenPackage.priceUsd * 100);
  if (session.amount_total !== expectedAmount || session.currency?.toLowerCase() !== 'usd') {
    throw new Error('Stripe token top-up amount or currency did not match the configured package.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, deleted: true } });
  if (!user || user.deleted) throw new Error('Stripe token top-up user was not found.');

  const existing = await prisma.tokenTopUpPurchase.findUnique({
    where: { stripeCheckoutSessionId: session.id },
  });
  if (existing) {
    if (existing.userId !== userId) throw new Error('Stripe token top-up session belongs to another user.');
    return { ignored: false as const, alreadyProcessed: true, tokensGranted: 0 };
  }

  const stripe = getStripeClient();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  const matchingLine = lineItems.data.find(
    (line) => line.price?.id === expectedPriceId && line.quantity === 1,
  );
  if (!matchingLine || lineItems.data.length !== 1) {
    throw new Error('Stripe token top-up line items did not match the configured package.');
  }

  const paymentIntentId = getPaymentIntentId(session);
  try {
    const balance = await prisma.$transaction(async (tx) => {
      await tx.tokenTopUpPurchase.create({
        data: {
          userId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
          stripePriceId: expectedPriceId,
          packageKey: packageKeyValue,
          tokens: tokenPackage.tokens,
          amountTotal: expectedAmount,
          currency: 'usd',
          livemode: session.livemode,
          payload: {
            source: 'stripe_checkout',
            eventId,
            customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      return grantTokens(
        {
          userId,
          amount: tokenPackage.tokens,
          type: TOKEN_TRANSACTION_TYPES.tokenTopUp,
          description: `Token top-up: ${tokenPackage.tokens.toLocaleString()} tokens`,
          initiator: makeSystemInitiator('stripe-top-up'),
          metadata: {
            checkoutSessionId: session.id,
            paymentIntentId,
            priceId: expectedPriceId,
            packageKey: packageKeyValue,
          },
        },
        tx,
      );
    });

    logStripeSubscriptionEvent('top_up_processed', {
      eventId,
      checkoutSessionId: session.id,
      paymentIntentId,
      userId,
      packageKey: packageKeyValue,
      tokensGranted: tokenPackage.tokens,
      balance,
    });
    return { ignored: false as const, alreadyProcessed: false, tokensGranted: tokenPackage.tokens, balance };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await prisma.tokenTopUpPurchase.findUnique({
        where: { stripeCheckoutSessionId: session.id },
      });
      if (duplicate?.userId === userId) {
        return { ignored: false as const, alreadyProcessed: true, tokensGranted: 0 };
      }
    }
    throw error;
  }
}

export async function getTokenTopUpPurchaseStatus(userId: string, checkoutSessionId: string) {
  const purchase = await prisma.tokenTopUpPurchase.findUnique({
    where: { stripeCheckoutSessionId: checkoutSessionId },
    select: { userId: true, tokens: true, createdAt: true },
  });
  if (!purchase || purchase.userId !== userId) return { status: 'pending' as const };
  return {
    status: 'credited' as const,
    tokens: purchase.tokens,
    creditedAt: purchase.createdAt.toISOString(),
  };
}
