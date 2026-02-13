import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { forbidden, ok, error } from '@/server/http';
import { prisma } from '@/server/db';

const bodySchema = z.object({
  limit: z.number().int().min(1).max(10).default(3),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  if (!(await assertDaemonAuth(req))) return forbidden('Invalid daemon credentials');
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid claim payload', 400, parsed.error.flatten());
  }
  const limit = parsed.data.limit;

  const tasks = await prisma.$transaction(async (tx) => {
    const candidates = await tx.userCharacterImageTask.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        variation: {
          include: { userCharacter: true },
        },
      },
    });
    if (candidates.length === 0) return [] as typeof candidates;
    const ids = candidates.map((task) => task.id);
    await tx.userCharacterImageTask.updateMany({
      where: { id: { in: ids }, status: 'queued' },
      data: { status: 'processing', updatedAt: new Date() },
    });
    await tx.userCharacterVariation.updateMany({
      where: { id: { in: candidates.map((c) => c.variationId) }, status: { not: 'ready' } },
      data: { status: 'processing' },
    });
    return candidates;
  });

  return ok({
    tasks: tasks.map((task) => ({
      id: task.id,
      userId: task.userId,
      variationId: task.variationId,
      description: task.description,
      createdAt: task.createdAt.toISOString(),
      userCharacterId: task.variation.userCharacterId,
      variationTitle: task.variation.title,
      characterTitle: task.variation.userCharacter.title,
    })),
  });
}, 'Failed to claim character image tasks');
