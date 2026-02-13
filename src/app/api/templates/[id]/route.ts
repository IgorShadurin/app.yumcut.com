import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { withApiError } from '@/server/errors';
import { ok, notFound } from '@/server/http';
import { getAuthSession } from '@/server/auth';

export const GET = withApiError(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id as string | undefined;
  const isAdmin = !!(session?.user as any)?.isAdmin;

  const tpl = await prisma.template.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      title: true,
      description: true,
      previewImageUrl: true,
      previewVideoUrl: true,
      textPrompt: true,
      weight: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!tpl) return notFound();
  if (!isAdmin && !(tpl.isPublic || (userId && tpl.ownerId === userId))) {
    return notFound();
  }
  // Do not leak ownerId to non-admins
  const { ownerId: _ownerId, ...safe } = tpl as any;
  return ok(safe);
}, 'Failed to load template');
