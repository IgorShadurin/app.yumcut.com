import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { withApiError } from '@/server/errors';
import { error, ok, unauthorized } from '@/server/http';
import {
  createStripeTokenTopUpCheckoutSession,
  isStripeTopUpConfigured,
} from '@/server/stripe/token-topups';
import { isTokenTopUpPackageKey } from '@/shared/constants/token-topups';

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  if (!user?.id) return unauthorized();
  if (!isStripeTopUpConfigured()) {
    return error('CONFIG_ERROR', 'Stripe token top-ups are not configured.', 500);
  }

  const body = (await req.json().catch(() => null)) as { package?: unknown } | null;
  if (!isTokenTopUpPackageKey(body?.package)) {
    return error('VALIDATION_ERROR', 'Package must be one of: "starter", "standard", "pro".', 400);
  }

  return ok(
    await createStripeTokenTopUpCheckoutSession({
      userId: user.id,
      userEmail: user.email ?? null,
      packageKey: body.package,
    }),
  );
}, 'Failed to create token top-up checkout session');
