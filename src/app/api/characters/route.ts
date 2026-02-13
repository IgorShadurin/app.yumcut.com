import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { normalizeMediaUrl } from '@/server/storage';
import { promises as fs } from 'fs';
import path from 'path';

function normalizeGlobalImagePath(imagePath: string | null | undefined) {
  if (!imagePath) return null;
  let working = imagePath.trim();
  if (!working) return null;
  if (working.startsWith('/')) working = working.slice(1);
  if (working.startsWith('public/')) {
    working = working.slice('public/'.length);
  }
  if (working.startsWith('content/')) {
    working = `characters/${working.slice('content/'.length)}`;
  }
  if (!working) return null;
  if (!working.startsWith('characters/')) {
    return `/${working}`;
  }
  return `/${working}`;
}

// Display overrides for seeded static characters (by filename base without extension).
// Keeps DB untouched; only adjusts titles/descriptions in API response.
const DISPLAY_OVERRIDES: Record<string, { title: string; description: string }> = {
  'it-girl-1-height': { title: 'Cozy Student', description: 'Warm coat and earmuffs — calm, friendly vibe.' },
  'it-girl-2-height': { title: 'Grunge Skater', description: 'Plaid overshirt, graphic tee — edgy and energetic.' },
  'it-girl-3-height': { title: 'Preppy Trendsetter', description: 'Glasses, tartan skirt — confident, stylish look.' },
  'it-guy-1-height': { title: 'Bearded Dev', description: 'Hoodie and jacket — friendly software engineer.' },
  'me-1': { title: 'Casual Black Tee', description: 'Relaxed outfit with dark tee and sneakers.' },
  'me-2': { title: 'Everyday Hoodie', description: 'Classic hoodie and jeans — approachable and modern.' },
  'cat-1': { title: 'Ginger Cat', description: 'Wide‑eyed tabby mascot with a bright collar.' },
  'cat-2': { title: 'Ginger Cat (Bell)', description: 'Smiling tabby with a bell collar — cheerful pet.' },
};

function baseFromImagePath(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  let p = imagePath.replace(/^\/+/, '').replace(/^public\//, '');
  p = p.replace(/^characters\//, '');
  const m = p.match(/^[^.]+/);
  return m ? m[0] : null;
}

async function seedStaticGlobalCharacters() {
  const charactersDir = path.join(process.cwd(), 'public', 'characters');
  try {
    const files = await fs.readdir(charactersDir);
    const imageFiles = files.filter((file) => /\.(png|jpg|jpeg|webp)$/i.test(file));
    for (const file of imageFiles) {
      const base = file.replace(/\.[^.]+$/, '');
      const title = base.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
      const normalizedTitle = title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Character';
      await prisma.character.create({
        data: {
          title: normalizedTitle,
          description: null,
          variations: {
            create: {
              title: normalizedTitle,
              description: null,
              prompt: null,
              imagePath: `characters/${file}`,
            },
          },
        },
      });
    }
  } catch (err) {
    console.error('Failed to seed static characters', err);
  }
}

export const GET = withApiError(async function GET() {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const [globalChars, userChars] = await Promise.all([
    prisma.character.findMany({ include: { variations: true } }),
    prisma.userCharacter.findMany({
      where: { userId, deleted: false },
      include: { variations: { where: { deleted: false }, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  let effectiveGlobal = globalChars;
  if (effectiveGlobal.length === 0) {
    await seedStaticGlobalCharacters();
    effectiveGlobal = await prisma.character.findMany({ include: { variations: true } });
  }

  const mapGlobal = effectiveGlobal.map((character) => {
    const firstBase = baseFromImagePath(character.variations[0]?.imagePath ?? null);
    const topOverride = firstBase ? DISPLAY_OVERRIDES[firstBase] : undefined;
    return {
      id: character.id,
      title: topOverride?.title ?? character.title,
      description: topOverride?.description ?? character.description,
      variations: character.variations.map((variation) => {
        const base = baseFromImagePath(variation.imagePath);
        const ovr = base ? DISPLAY_OVERRIDES[base] : undefined;
        return {
          id: variation.id,
          title: ovr?.title ?? variation.title,
          description: ovr?.description ?? variation.description,
          prompt: variation.prompt,
          imageUrl: normalizeGlobalImagePath(variation.imagePath) ?? '/characters/me-2.png',
          status: 'ready' as const,
        };
      }),
    };
  });

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
      source: variation.source ?? 'upload',
    })),
  }));

  return ok({ global: mapGlobal, mine: mapUser });
}, 'Failed to load characters');
