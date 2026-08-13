import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { withApiError } from '@/server/errors';
import { error, ok, unauthorized } from '@/server/http';
import { getTokenTopUpPurchaseStatus } from '@/server/stripe/token-topups';

export const GET = withApiError(async function GET(req: NextRequest) {
  const session = await getAuthSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return unauthorized();

  const checkoutSessionId = req.nextUrl.searchParams.get('session_id')?.trim();
  if (!checkoutSessionId || !checkoutSessionId.startsWith('cs_') || checkoutSessionId.length > 128) {
    return error('VALIDATION_ERROR', 'A valid Stripe Checkout session ID is required.', 400);
  }

  return ok(await getTokenTopUpPurchaseStatus(userId, checkoutSessionId));
}, 'Failed to get token top-up status');
