import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { daemonClaimJobsSchema } from '@/server/validators/daemon';
import { legalStatusTypePairs } from '@/shared/pipeline/job-types';

export const GET = withApiError(async function GET(req: NextRequest) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const parsed = daemonClaimJobsSchema.safeParse({ limit: req.nextUrl.searchParams.get('limit') });
  const limit = parsed.success ? parsed.data.limit : 10;

  const pairs = legalStatusTypePairs();
  const rows = await prisma.job.findMany({
    where: {
      status: 'queued',
      OR: pairs.map((p) => ({ type: p.type, project: { status: p.status } })),
      project: {
        AND: [
          { jobs: { none: { status: 'running' } } },
          {
            OR: [
              { currentDaemonId: daemonId },
              { currentDaemonId: null },
            ],
          },
        ],
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, projectId: true, type: true, status: true, createdAt: true, payload: true },
  });

  return ok({
    jobs: rows.map((job) => ({
      id: job.id,
      projectId: job.projectId,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      payload: job.payload,
    })),
  });
}, 'Failed to load queued jobs');
