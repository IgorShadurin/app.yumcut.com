import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { daemonJobCreateSchema } from '@/server/validators/daemon';
import { jobTypeForStatus } from '@/shared/pipeline/job-types';

export const POST = withApiError(async function POST(req: NextRequest) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const json = await req.json();
  const parsed = daemonJobCreateSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }

  const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  // Guard: only create if type matches current project status
  const expected = jobTypeForStatus(project.status as any);
  if (expected && expected !== parsed.data.type) {
    return ok({ skipped: true, reason: 'status-mismatch' } as any);
  }

  // Idempotent: if a queued/running job of the same type exists, return it instead of creating a duplicate
  const activeJobs = await prisma.job.findMany({
    where: { projectId: parsed.data.projectId, type: parsed.data.type, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'asc' },
  });
  const languageCode = typeof (parsed.data.payload as any)?.languageCode === 'string'
    ? ((parsed.data.payload as any).languageCode as string).trim().toLowerCase()
    : null;
  if (activeJobs.length > 0) {
    const matching = languageCode
      ? activeJobs.find((job) => {
          const jobLang = typeof (job.payload as any)?.languageCode === 'string'
            ? ((job.payload as any).languageCode as string).trim().toLowerCase()
            : null;
          return jobLang === languageCode;
        })
      : activeJobs[0];
    if (matching) {
      return ok({
        id: matching.id,
        projectId: matching.projectId,
        type: matching.type,
        status: matching.status,
        createdAt: matching.createdAt.toISOString(),
        reused: true,
      });
    }
  }

  const job = await prisma.job.create({
    data: {
      projectId: parsed.data.projectId,
      userId: parsed.data.userId,
      type: parsed.data.type,
      status: 'queued',
      payload: (parsed.data.payload ?? {}) as any,
    },
  });

  return ok({
    id: job.id,
    projectId: job.projectId,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
  });
}, 'Failed to create job');
