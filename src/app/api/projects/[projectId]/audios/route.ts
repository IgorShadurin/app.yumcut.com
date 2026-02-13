import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { normalizeMediaUrl } from '@/server/storage';

type Params = { projectId: string };

export const GET = withApiError(async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');

  const candidates = await prisma.audioCandidate.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } });
  return ok({
    candidates: candidates.map((c) => ({
      id: c.id,
      path: c.publicUrl || normalizeMediaUrl(c.path),
    })),
  });
}, 'Failed to load audio candidates');
