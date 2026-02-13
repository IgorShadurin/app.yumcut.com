import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { normalizeMediaUrl } from '@/server/storage';
import type { CharacterSelectionSnapshot, CharacterSelectionSource } from '@/shared/types';

const storedCharacterSelectionSchema = z.union([
  z.object({
    source: z.literal('dynamic'),
  }),
  z.object({
    source: z.enum(['global', 'user']),
    characterId: z.string().uuid().optional().nullable(),
    userCharacterId: z.string().uuid().optional().nullable(),
    variationId: z.string().uuid().optional().nullable(),
  }),
]);

export type StoredCharacterSelection = z.infer<typeof storedCharacterSelectionSchema>;

type CharacterSelectionDisplayInput = {
  source?: CharacterSelectionSource | null;
  type?: 'global' | 'user' | 'dynamic' | null;
  characterTitle?: string | null;
  variationTitle?: string | null;
};

type CharacterSelectionLabelResult = {
  badge: string;
  display: string | null;
};

function coerceStatus(status: string | null | undefined): 'ready' | 'processing' | 'failed' {
  if (!status) return 'ready';
  if (status === 'ready') return 'ready';
  if (status === 'failed') return 'failed';
  return 'processing';
}

function uniqueLabelParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of parts) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function computeCharacterSelectionLabels(input: CharacterSelectionDisplayInput | null | undefined): CharacterSelectionLabelResult | null {
  if (!input) return null;
  const inferredSource = input.source ?? input.type ?? null;
  if (inferredSource === 'dynamic') {
    return {
      badge: 'Auto character',
      display: 'Auto character',
    };
  }
  const base =
    inferredSource === 'user'
      ? 'My character'
      : inferredSource === 'global'
        ? 'Public character'
        : 'Character';
  const nameParts = uniqueLabelParts([input.variationTitle ?? null, input.characterTitle ?? null]);
  const display = nameParts.length > 0 ? nameParts.join(' • ') : base;
  return { badge: base, display };
}

export function withCharacterSelectionLabels<T extends Record<string, any> | null | undefined>(
  selection: T,
): T {
  if (!selection) return selection;
  const currentSource = (selection as any).source ?? (selection as any).type ?? null;
  const normalizedSource: CharacterSelectionSource | null =
    currentSource === 'dynamic' || currentSource === 'user' || currentSource === 'global'
      ? currentSource
      : null;
  const normalizedType: 'global' | 'user' | 'dynamic' | null =
    (selection as any).type && ((selection as any).type === 'user' || (selection as any).type === 'global' || (selection as any).type === 'dynamic')
      ? (selection as any).type
      : normalizedSource === 'dynamic'
        ? 'dynamic'
        : normalizedSource === 'user'
          ? 'user'
      : normalizedSource === 'global'
        ? 'global'
        : null;
  const labels = computeCharacterSelectionLabels({
    source: normalizedSource,
    type: normalizedType,
    characterTitle: (selection as any).characterTitle ?? null,
    variationTitle: (selection as any).variationTitle ?? null,
  });
  return {
    ...selection,
    source: normalizedSource ?? undefined,
    type: normalizedType ?? undefined,
    badgeLabel: labels?.badge ?? undefined,
    displayLabel: labels?.display ?? undefined,
  };
}

export function parseStoredCharacterSelection(raw: unknown): StoredCharacterSelection | null {
  if (!raw) return null;
  const parsed = storedCharacterSelectionSchema.safeParse(raw);
  if (!parsed.success) return null;
  if ((parsed.data as any).source !== 'dynamic') {
    const { variationId } = parsed.data as any;
    if (!variationId) return null;
  }
  return parsed.data;
}

export function serializeStoredCharacterSelection(selection: StoredCharacterSelection | null): StoredCharacterSelection | null {
  if (!selection) return null;
  const parsed = storedCharacterSelectionSchema.safeParse(selection);
  if (!parsed.success) return null;
  return parsed.data;
}

export async function resolveCharacterSelectionSnapshot(opts: {
  client: PrismaClient;
  stored: StoredCharacterSelection | null;
  userId?: string;
}): Promise<CharacterSelectionSnapshot | null> {
  const { client, stored, userId } = opts;
  if (!stored) return null;
  if (stored.source === 'dynamic') {
    return withCharacterSelectionLabels({
      source: 'dynamic',
      type: 'dynamic',
      status: 'processing',
      imageUrl: null,
    });
  }
  if (stored.source === 'global') {
    if (!stored.variationId) return null;
    const variation = await client.characterVariation.findUnique({
      where: { id: stored.variationId },
      include: { character: true },
    });
    if (!variation) return null;
    if (stored.characterId && variation.characterId !== stored.characterId) return null;
    const imageUrl = variation.imagePath
      ? (variation.imagePath.startsWith('/') ? variation.imagePath : `/${variation.imagePath}`)
      : null;
    return withCharacterSelectionLabels({
      source: 'global',
      type: 'global',
      characterId: variation.characterId,
      variationId: variation.id,
      characterTitle: variation.character?.title ?? null,
      variationTitle: variation.title ?? null,
      imageUrl,
      status: 'ready',
    });
  }

  if (!stored.variationId) return null;
  const variation = await client.userCharacterVariation.findFirst({
    where: { id: stored.variationId, deleted: false, userCharacter: { deleted: false } },
    include: { userCharacter: true },
  });
  if (!variation) return null;
  if (stored.userCharacterId && variation.userCharacterId !== stored.userCharacterId) return null;
  if (userId && variation.userCharacter.userId !== userId) return null;
  const rawUrl = variation.imageUrl || normalizeMediaUrl(variation.imagePath ?? null);
  return withCharacterSelectionLabels({
    source: 'user',
    type: 'user',
    characterId: null,
    userCharacterId: variation.userCharacterId,
    variationId: variation.id,
    characterTitle: variation.userCharacter.title ?? null,
    variationTitle: variation.title ?? null,
    imageUrl: rawUrl,
    status: coerceStatus(variation.status),
  });
}
