import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { getAuthSession } from '@/server/auth';
import { unauthorized, notFound, ok } from '@/server/http';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { userCharacterId: string; variationId: string };

export const DELETE = withApiError(async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { userCharacterId, variationId } = await params;

  const variation = await prisma.userCharacterVariation.findFirst({
    where: { id: variationId, userCharacterId, deleted: false },
    select: {
      id: true,
      imagePath: true,
      userCharacter: {
        select: {
          id: true,
          userId: true,
          deleted: true,
        },
      },
    },
  });
  if (!variation || variation.userCharacter.userId !== userId || variation.userCharacter.deleted) {
    return notFound('Character variation not found');
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.projectCharacterSelection.deleteMany({ where: { userCharacterVariationId: variation.id } });
    await tx.userCharacterVariation.update({
      where: { id: variation.id },
      data: { deleted: true, deletedAt: now },
    });
    const remaining = await tx.userCharacterVariation.count({ where: { userCharacterId, deleted: false } });
    if (remaining === 0) {
      await tx.userCharacter.update({
        where: { id: userCharacterId },
        data: { deleted: true, deletedAt: now },
      });
    }
  });

  return ok({ ok: true });
}, 'Failed to delete character variation');
