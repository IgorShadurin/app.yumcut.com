import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, error, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { z } from 'zod';

const bodySchema = z.object({ title: z.string().min(1), description: z.string().optional(), prompt: z.string().optional() });

type Params = { userCharacterId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { userCharacterId } = await params;
  const uc = await prisma.userCharacter.findFirst({ where: { id: userCharacterId, userId, deleted: false } });
  if (!uc) return notFound('User character not found');

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const created = await prisma.userCharacterVariation.create({
    data: {
      userCharacterId: uc.id,
      title: parsed.data.title,
      description: parsed.data.description,
      prompt: parsed.data.prompt,
    },
  });
  return ok(created);
}, 'Failed to create character variation');
