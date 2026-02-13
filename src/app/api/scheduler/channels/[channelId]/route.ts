import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden, notFound } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { deletePublishChannel } from '@/server/publishing/channels';

type Params = { channelId: string };

export const DELETE = withApiError(async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }
  const { channelId } = await params;
  try {
    await deletePublishChannel(userId, channelId);
  } catch (err) {
    return notFound('Channel not found');
  }
  return ok({ removed: true });
}, 'Failed to disconnect channel');
