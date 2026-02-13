import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { textRequestSchema } from '@/server/validators/projects';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  // Keep validation for legacy clients, but ignore the payload.
  try {
    const json = await req.json();
    const parsed = textRequestSchema.safeParse(json);
    if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  } catch (_) {
    // Allow empty body as no-op
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');

  // No longer store text requests; this endpoint is a no-op for compatibility.
  return ok({ ok: true });
}, 'Failed to request audio change');
