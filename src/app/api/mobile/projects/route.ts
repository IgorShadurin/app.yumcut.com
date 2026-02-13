import { NextRequest } from 'next/server';
import { ok } from '@/server/http';
import { withApiError } from '@/server/errors';
import { prisma } from '@/server/db';
import { ProjectStatus } from '@/shared/constants/status';
import type { ProjectListItemDTO } from '@/shared/types';
import { requireMobileUserId } from '../shared/auth';

export const GET = withApiError(async function GET(req: NextRequest) {
  const auth = await requireMobileUserId(req);
  if ('error' in auth) {
    return auth.error;
  }
  const { userId } = auth;

  const projects = await prisma.project.findMany({
    where: { userId, deleted: false },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
    },
  });

  const trunc = (t: string) => (t.length > 60 ? `${t.slice(0, 57)}...` : t);

  const payload = projects.map((project) => ({
    id: project.id,
    title: trunc(project.title),
    status: project.status as ProjectStatus,
    createdAt: project.createdAt.toISOString(),
  } satisfies ProjectListItemDTO));

  return ok(payload);
}, 'Failed to load mobile projects');
