import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { unauthorized, ok } from '@/server/http';
import { verifyMobileAccessToken } from '@/server/mobile-auth';
import { getUserSubscriptionStatus } from '@/server/subscriptions';

export const GET = withApiError(async function GET(req: NextRequest) {
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

  const status = await getUserSubscriptionStatus(claims.sub);
  return ok(status);
}, 'Failed to load subscription status');
