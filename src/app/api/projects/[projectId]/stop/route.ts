import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ProjectStatus } from '@/shared/constants/status';

type Params = { projectId: string };

export const POST = withApiError(async function POST(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');

  await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { status: ProjectStatus.Cancelled } }),
    prisma.projectStatusHistory.create({ data: { projectId: project.id, status: ProjectStatus.Cancelled, message: 'User cancelled' } }),
  ]);

  return ok({ ok: true });
}, 'Failed to cancel project');
