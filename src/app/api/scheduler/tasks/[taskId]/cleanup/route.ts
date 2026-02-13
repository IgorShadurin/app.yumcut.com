import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, error } from '@/server/http';
import { assertDaemonAuth } from '@/server/auth';
import { markPublishTaskCleanupDone, markPublishTaskCleanupFailed } from '@/server/publishing/tasks';

const schema = z.object({
  status: z.enum(['done', 'failed']),
  error: z.string().max(1000).optional(),
});

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  if (!(await assertDaemonAuth(req))) return unauthorized('Daemon credentials required');
  const { taskId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid cleanup payload', 400, parsed.error.flatten());
  }
  if (parsed.data.status === 'done') {
    await markPublishTaskCleanupDone(taskId);
  } else {
    await markPublishTaskCleanupFailed(taskId, parsed.data.error || 'Cleanup failed');
  }
  return ok({ updated: true });
}, 'Failed to update cleanup state');
