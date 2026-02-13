import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { forbidden, error, ok, notFound } from '@/server/http';
import { prisma } from '@/server/db';

const bodySchema = z.object({
  status: z.enum(['done', 'failed']),
  path: z.string().optional(),
  url: z.string().optional(),
  failureReason: z.string().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { taskId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  if (!(await assertDaemonAuth(req))) return forbidden('Invalid daemon credentials');
  const { taskId } = await params;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid completion payload', 400, parsed.error.flatten());
  }

  const task = await prisma.userCharacterImageTask.findUnique({ where: { id: taskId } });
  if (!task) return notFound('Task not found');

  if (task.status !== 'processing') {
    return error('INVALID_STATE', 'Task is not in processing state', 400);
  }

  if (parsed.data.status === 'done') {
    if (!parsed.data.path || !parsed.data.url) {
      return error('VALIDATION_ERROR', 'Path and URL are required when marking as done', 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.userCharacterImageTask.update({
        where: { id: taskId },
        data: {
          status: 'done',
          resultPath: parsed.data.path,
          resultUrl: parsed.data.url,
          failureReason: null,
        },
      });
      await tx.userCharacterVariation.update({
        where: { id: task.variationId },
        data: {
          imagePath: parsed.data.path,
          imageUrl: parsed.data.url,
          status: 'ready',
        },
      });
    });
    return ok({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.userCharacterImageTask.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        failureReason: parsed.data.failureReason ?? 'Generation failed',
      },
    });
    await tx.userCharacterVariation.update({
      where: { id: task.variationId },
      data: {
        status: 'failed',
      },
    });
  });

  return ok({ ok: true });
}, 'Failed to complete character image task');
