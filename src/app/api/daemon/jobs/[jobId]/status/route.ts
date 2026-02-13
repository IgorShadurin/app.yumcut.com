import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { daemonJobStatusSchema } from '@/server/validators/daemon';

type Params = { jobId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { jobId } = await params;
  const json = await req.json();
  const parsed = daemonJobStatusSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return notFound('Job not found');
  if (job.daemonId && job.daemonId !== daemonId) {
    return forbidden('Job owned by another daemon');
  }

  const shouldRelease =
    parsed.data.status === 'done' ||
    parsed.data.status === 'failed' ||
    parsed.data.status === 'paused';

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: { status: parsed.data.status, ...(job.daemonId ? {} : { daemonId }) },
    });
    if (shouldRelease && job.daemonId === daemonId) {
      await tx.project.update({
        where: { id: job.projectId, currentDaemonId: daemonId },
        data: { currentDaemonId: null, currentDaemonLockedAt: null },
      });
    }
  });
  return ok({ ok: true });
}, 'Failed to update job status');
