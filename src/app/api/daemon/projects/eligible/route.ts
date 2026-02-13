import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { ProjectStatus } from '@/shared/constants/status';
import { daemonEligibleProjectsQuerySchema } from '@/server/validators/daemon';

const actionable: ProjectStatus[] = [
  ProjectStatus.New,
  ProjectStatus.ProcessScript,
  ProjectStatus.ProcessAudio,
  ProjectStatus.ProcessTranscription,
  ProjectStatus.ProcessMetadata,
  ProjectStatus.ProcessCaptionsVideo,
  ProjectStatus.ProcessImagesGeneration,
  ProjectStatus.ProcessVideoPartsGeneration,
  ProjectStatus.ProcessVideoMain,
];

export const GET = withApiError(async function GET(req: NextRequest) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const result = daemonEligibleProjectsQuerySchema.safeParse({ limit: req.nextUrl.searchParams.get('limit') });
  const limit = result.success ? result.data.limit : 10;

  const rows = await prisma.project.findMany({
    where: {
      deleted: false,
      status: { in: actionable as any },
      OR: [
        { currentDaemonId: daemonId },
        { currentDaemonId: null },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, status: true, userId: true, createdAt: true, updatedAt: true },
  });

  return ok({
    projects: rows.map((row) => ({
      id: row.id,
      status: row.status as ProjectStatus,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}, 'Failed to load daemon projects');
