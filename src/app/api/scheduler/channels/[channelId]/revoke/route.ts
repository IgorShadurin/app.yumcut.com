import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { revokePublishChannelTokens } from '@/server/publishing/channels';

type Params = { channelId: string };

export const POST = withApiError(async function POST(_req: Request, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }
  const { channelId } = await params;
  await revokePublishChannelTokens(userId, channelId);
  return ok({ revoked: true });
}, 'Failed to revoke channel tokens');
