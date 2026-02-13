import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { getAuthSession } from '@/server/auth';
import { unauthorized, ok, error, forbidden } from '@/server/http';
import { prisma } from '@/server/db';
import { LIMITS } from '@/server/limits';
import { TOKEN_COSTS, TOKEN_TRANSACTION_TYPES } from '@/shared/constants/token-costs';
import { spendTokens, makeUserInitiator } from '@/server/tokens';

const bodySchema = z.object({
  title: z.string().min(1).max(LIMITS.titleMax),
  description: z.string().min(10).max(LIMITS.customCharacterPromptMax),
  attachToCharacterId: z.string().uuid().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid generation payload', 400, parsed.error.flatten());
  }
  const { title, description, attachToCharacterId } = parsed.data;
  const cost = TOKEN_COSTS.actions.characterImage;

  let targetCharacterId: string | null = null;
  if (attachToCharacterId) {
    const existing = await prisma.userCharacter.findFirst({ where: { id: attachToCharacterId, userId, deleted: false } });
    if (!existing) return forbidden('Character not found');
    targetCharacterId = existing.id;
  }

  const characterDescription = description.slice(0, LIMITS.descriptionMax);
  const variationDescription = description.slice(0, LIMITS.descriptionMax);

  const result = await prisma.$transaction(async (tx) => {
    await spendTokens({
      userId,
      amount: cost,
      type: TOKEN_TRANSACTION_TYPES.characterImage,
      description: 'Custom character image generation',
      initiator: makeUserInitiator(userId),
      metadata: { title },
    }, tx);

    let userCharacterId: string;
    if (targetCharacterId) {
      userCharacterId = targetCharacterId;
    } else {
      const created = await tx.userCharacter.create({
        data: {
          userId,
          title,
          description: characterDescription,
        },
      });
      userCharacterId = created.id;
    }

    const variation = await tx.userCharacterVariation.create({
      data: {
        userCharacterId,
        title,
        description: variationDescription,
        status: 'processing',
        source: 'generated',
      },
    });

    const task = await tx.userCharacterImageTask.create({
      data: {
        userId,
        variationId: variation.id,
        description,
        status: 'queued',
      },
    });

    return { userCharacterId, variationId: variation.id, taskId: task.id };
  });

  return ok({
    ...result,
    tokenCost: cost,
  });
}, 'Failed to queue character image generation');
