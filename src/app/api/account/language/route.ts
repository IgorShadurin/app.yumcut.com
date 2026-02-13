import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { withApiError } from '@/server/errors';
import { error, ok, unauthorized } from '@/server/http';
import { normalizeAppLanguage, parseAppLanguage } from '@/shared/constants/app-language';

const patchAccountLanguageSchema = z.object({
  language: z.enum(['en', 'ru']),
});

export const GET = withApiError(async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.email || !(session.user as any).id) return unauthorized();

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLanguage: true },
  });
  if (!user) return unauthorized();

  return ok({ language: normalizeAppLanguage(user.preferredLanguage) });
}, 'Failed to load account language');

export const PATCH = withApiError(async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email || !(session.user as any).id) return unauthorized();

  const parsed = patchAccountLanguageSchema.safeParse(await req.json());
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid account language payload', 400, parsed.error.flatten());
  }

  const userId = (session.user as any).id as string;
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) return unauthorized();

  const nextLanguage = parseAppLanguage(parsed.data.language);
  if (!nextLanguage) {
    return error('VALIDATION_ERROR', 'Unsupported language', 400);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { preferredLanguage: nextLanguage },
    select: { preferredLanguage: true },
  });

  return ok({ language: normalizeAppLanguage(updated.preferredLanguage) });
}, 'Failed to update account language');
