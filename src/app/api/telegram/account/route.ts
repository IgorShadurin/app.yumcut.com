import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { getTelegramAccount, disconnectTelegramForUser, isTelegramEnabled } from '@/server/telegram';

export const GET = withApiError(async function GET() {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const account = await getTelegramAccount(userId);
  return ok({
    connected: !!account,
    account: account
      ? {
          username: account.username,
          firstName: account.firstName,
          lastName: account.lastName,
          linkedAt: account.linkedAt.toISOString(),
        }
      : null,
    enabled: isTelegramEnabled(),
  });
}, 'Failed to load Telegram account');

export const DELETE = withApiError(async function DELETE(_req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  await disconnectTelegramForUser(userId);
  return ok({ ok: true });
}, 'Failed to disconnect Telegram account');
