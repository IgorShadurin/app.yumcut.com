import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { z } from 'zod';

const bodySchema = z.object({ title: z.string().min(1), description: z.string().optional() });

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const created = await prisma.userCharacter.create({ data: { userId, title: parsed.data.title, description: parsed.data.description } });
  return ok(created);
}, 'Failed to create character');
