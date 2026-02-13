import { NextRequest } from 'next/server';
import { error, ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { verifyMobileAccessToken } from '@/server/mobile-auth';
import { processIosSubscriptionPurchase, SubscriptionError } from '@/server/subscriptions';
import { logAppleSubscriptionEvent } from '@/server/app-store/subscription-logger';

export const POST = withApiError(async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : '';

  if (!token) {
    return unauthorized('Missing access token.');
  }

  const claims = await verifyMobileAccessToken(token);
  if (!claims?.sub) {
    return unauthorized('Invalid or expired access token.');
  }

  const body = (await req.json().catch(() => null)) as { receiptData?: string | null; signedTransactions?: unknown } | null;
  const receiptData = typeof body?.receiptData === 'string' && body.receiptData.trim().length > 0 ? body.receiptData : undefined;
  const signedTransactions = Array.isArray(body?.signedTransactions)
    ? (body?.signedTransactions as unknown[]).filter((value): value is string => typeof value === 'string' && value.length > 0)
    : undefined;

  if (!receiptData && (!signedTransactions || signedTransactions.length === 0)) {
    return error('BAD_REQUEST', 'Either receiptData or signedTransactions must be provided.', 400);
  }

  logAppleSubscriptionEvent('mobile_purchase_request', {
    userId: claims.sub,
    hasReceipt: Boolean(receiptData),
    receiptLength: receiptData?.length ?? 0,
    signedTransactionsCount: signedTransactions?.length ?? 0,
  });

  try {
    const result = await processIosSubscriptionPurchase({
      userId: claims.sub,
      receiptData,
      signedTransactions,
      source: claims.isGuest ? 'guest_purchase' : 'user_purchase',
    });

    logAppleSubscriptionEvent('mobile_purchase_result', {
      userId: claims.sub,
      status: result.alreadyProcessed ? 'already_processed' : 'credited',
      productId: result.productId,
      transactionId: result.transactionId,
      tokensGranted: result.tokensGranted,
      balance: result.balance,
      expiresAt: result.expiresAt,
    });

    return ok({
      status: result.alreadyProcessed ? 'already_processed' : 'credited',
      productId: result.productId,
      transactionId: result.transactionId,
      tokensGranted: result.tokensGranted,
      balance: result.balance,
      expiresAt: result.expiresAt ?? undefined,
    });
  } catch (err) {
    if (err instanceof SubscriptionError) {
      logAppleSubscriptionEvent('mobile_purchase_error', {
        userId: claims.sub,
        status: err.status,
        message: err.message,
      });
      if (err.status === 400) {
        return error('BAD_REQUEST', err.message, 400);
      }
      if (err.status === 401) {
        return unauthorized(err.message);
      }
      return new Response(JSON.stringify({ error: err.message }), { status: err.status });
    }
    throw err;
  }
}, 'Failed to process subscription purchase');
