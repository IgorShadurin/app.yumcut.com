import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, error } from '@/server/http';
import { assertDaemonAuth } from '@/server/auth';
import { markPublishTaskScheduled, markPublishTaskFailed, markPublishTaskCompleted, markPublishTaskRetry } from '@/server/publishing/tasks';

const updateSchema = z.object({
  status: z.enum(['scheduled', 'completed', 'failed', 'retry']),
  providerTaskId: z.string().max(255).optional(),
  providerResponse: z.record(z.string(), z.any()).optional(),
  error: z.string().max(2000).optional(),
});

type Params = { taskId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  if (!(await assertDaemonAuth(req))) return unauthorized('Daemon credentials required');
  const { taskId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid task update payload', 400, parsed.error.flatten());
  }
  const payload = parsed.data;

  if (payload.status === 'scheduled') {
    await markPublishTaskScheduled(taskId, {
      providerTaskId: payload.providerTaskId ?? null,
      providerResponse: payload.providerResponse ?? null,
    });
  } else if (payload.status === 'completed') {
    await markPublishTaskCompleted(taskId);
  } else if (payload.status === 'failed') {
    await markPublishTaskFailed(taskId, payload.error || 'Unknown publish error', payload.providerResponse ?? null);
  } else if (payload.status === 'retry') {
    await markPublishTaskRetry(taskId, payload.error || 'Needs retry', payload.providerResponse ?? null);
  }

  return ok({ updated: true });
}, 'Failed to update publish task');
