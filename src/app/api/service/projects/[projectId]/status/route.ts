import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { serviceStatusSchema } from '@/server/validators/service';
import { assertServiceAuth } from '@/server/auth';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  if (!assertServiceAuth(req)) return forbidden('Invalid service credentials');
  const { projectId } = await params;
  const json = await req.json();
  const parsed = serviceStatusSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');

  const { status, message, extra } = parsed.data;

  await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { status } }),
    prisma.projectStatusHistory.create({ data: { projectId: project.id, status, message, extra: extra as any } }),
  ]);

  return ok({ ok: true });
}, 'Failed to update project status');
