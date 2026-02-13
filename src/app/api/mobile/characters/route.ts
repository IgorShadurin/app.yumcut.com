import { NextRequest } from 'next/server';
import { ok } from '@/server/http';
import { withApiError } from '@/server/errors';
import { prisma } from '@/server/db';
import { normalizeMediaUrl } from '@/server/storage';
import { requireMobileUserId } from '../shared/auth';

function normalizeGlobalImagePath(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  let working = imagePath.trim();
  if (!working) return null;
  if (working.startsWith('/')) working = working.slice(1);
  if (working.startsWith('public/')) {
    working = working.slice('public/'.length);
  }
  if (working.startsWith('characters/')) {
    return `/${working}`;
  }
  return `/${working}`;
}

export const GET = withApiError(async function GET(req: NextRequest) {
  const auth = await requireMobileUserId(req);
  if ('error' in auth) {
    return auth.error;
  }

  const [globalChars, userChars] = await Promise.all([
    prisma.character.findMany({ include: { variations: true } }),
    prisma.userCharacter.findMany({
      where: { userId: auth.userId, deleted: false },
      include: { variations: { where: { deleted: false }, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const mapGlobal = globalChars.map((character) => ({
    id: character.id,
    title: character.title,
    description: character.description,
    variations: character.variations.map((variation) => ({
      id: variation.id,
      title: variation.title,
      description: variation.description,
      prompt: variation.prompt,
      imageUrl: normalizeGlobalImagePath(variation.imagePath) ?? '/characters/me-2.png',
      status: 'ready' as const,
    })),
  }));

  const mapUser = userChars.map((character) => ({
    id: character.id,
    title: character.title,
    description: character.description,
    variations: character.variations.map((variation) => ({
      id: variation.id,
      title: variation.title,
      description: variation.description,
      prompt: variation.prompt,
      imageUrl: variation.imageUrl ?? normalizeMediaUrl(variation.imagePath ?? null),
      status: variation.status as 'ready' | 'processing' | 'failed',
    })),
  }));

  return ok({ global: mapGlobal, mine: mapUser });
}, 'Failed to load characters');
