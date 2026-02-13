import { getAuthSession } from '@/server/auth';
import { ok, unauthorized, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { createTelegramLinkToken, isTelegramEnabled } from '@/server/telegram';

export const POST = withApiError(async function POST() {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  if (!isTelegramEnabled()) {
    return forbidden('Telegram integration is not configured');
  }
  const userId = (session.user as any).id as string;
  const token = await createTelegramLinkToken(userId);
  return ok({
    code: token.code,
    deepLinkUrl: token.deepLink,
    expiresAt: token.expiresAt.toISOString(),
  });
}, 'Failed to create Telegram link token');
