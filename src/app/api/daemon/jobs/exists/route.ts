import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { daemonJobExistsQuerySchema } from '@/server/validators/daemon';

export const GET = withApiError(async function GET(req: NextRequest) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const parsed = daemonJobExistsQuerySchema.safeParse({
    projectId: req.nextUrl.searchParams.get('projectId'),
    type: req.nextUrl.searchParams.get('type'),
  });
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid query', 400, parsed.error.flatten());
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, currentDaemonId: true },
  });
  if (!project) {
    return ok({ exists: false });
  }
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const count = await prisma.job.count({
    where: {
      projectId: parsed.data.projectId,
      type: parsed.data.type,
      status: { in: ['queued', 'running'] },
    },
  });
  return ok({ exists: count > 0 });
}, 'Failed to check job existence');
