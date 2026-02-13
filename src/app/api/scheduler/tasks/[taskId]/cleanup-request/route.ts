import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden, notFound, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { prisma } from '@/server/db';
import { requestPublishTaskCleanup } from '@/server/publishing/tasks';

const schema = z.object({ reason: z.string().max(500).optional() });

type Params = { taskId: string };

export const POST = withApiError(async function POST(req: Request, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }

  const { taskId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid cleanup payload', 400, parsed.error.flatten());
  }

  const task = await prisma.publishTask.findFirst({
    where: { id: taskId, userId },
    select: { id: true, providerTaskId: true, status: true },
  });
  if (!task) return notFound('Task not found');
  if (!task.providerTaskId) {
    return error('NO_PROVIDER_TASK', 'This upload has not been scheduled yet.', 400);
  }

  if (task.status === 'cleanup_pending' || task.status === 'cleanup_processing') {
    return ok({ cleanupRequested: true });
  }

  await requestPublishTaskCleanup(taskId, parsed.data.reason);
  return ok({ cleanupRequested: true });
}, 'Failed to request cleanup');
