import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Api } from '@/lib/api-client';
import { DYNAMIC_CHARACTER_RECORD, INITIAL_COLLECTION } from './constants';
import type { CharacterCollections, CharacterRecord, CharacterSelection } from './types';

type CollectionsResponse = {
  global?: any[];
  mine?: any[];
};

function mapRecords(items: any[] = []): CharacterRecord[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? null,
    variations: (item.variations || []).map((variation: any) => ({
      id: variation.id,
      title: variation.title ?? null,
      description: variation.description ?? null,
      imageUrl: variation.imageUrl ?? null,
      status: (variation.status as 'ready' | 'processing' | 'failed') || 'ready',
    })),
  }));
}

function buildCollections(response: CollectionsResponse): CharacterCollections {
  const baseGlobal = mapRecords(response.global);
  return {
    global: [DYNAMIC_CHARACTER_RECORD, ...baseGlobal],
    mine: mapRecords(response.mine),
  };
}

export function useCharacterCollections(
  open: boolean,
  currentSelection: CharacterSelection | null,
  onSelectionCleared: () => void,
) {
  const [collections, setCollections] = useState<CharacterCollections>(INITIAL_COLLECTION);
  const [loading, setLoading] = useState(false);

  const fetchCharacters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await Api.getCharacters() as CollectionsResponse;
      setCollections(buildCollections(response));
    } catch (err) {
      console.error('Failed to load characters', err);
      toast.error('Failed to load characters');
      setCollections(INITIAL_COLLECTION);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchCharacters();
  }, [open, fetchCharacters]);

  const hasPending = useMemo(
    () => collections.mine.some((character) =>
      character.variations.some((variation) => variation.status !== 'ready'),
    ),
    [collections.mine],
  );

  useEffect(() => {
    if (!open || !hasPending) return;
    const interval = setInterval(() => {
      void fetchCharacters();
    }, 5000);
    return () => clearInterval(interval);
  }, [open, hasPending, fetchCharacters]);

  const pendingCount = useMemo(
    () => collections.mine.reduce(
      (acc, character) => acc + character.variations.filter((v) => v.status === 'processing').length,
      0,
    ),
    [collections.mine],
  );

  const handleVariationDeleted = useCallback((payload: { characterId: string; variationId: string; source: 'global' | 'user' }) => {
    if (payload.source !== 'user') return;
    setCollections((prev) => {
      const nextMine: CharacterRecord[] = [];
      for (const character of prev.mine) {
        if (character.id !== payload.characterId) {
          nextMine.push(character);
          continue;
        }
        const remaining = character.variations.filter((variation) => variation.id !== payload.variationId);
        if (remaining.length > 0) {
          nextMine.push({ ...character, variations: remaining });
        }
      }
      return { ...prev, mine: nextMine };
    });
    if (currentSelection?.source === 'user' && currentSelection.variationId === payload.variationId) {
      onSelectionCleared();
    }
  }, [currentSelection, onSelectionCleared]);

  return {
    collections,
    loading,
    pendingCount,
    refresh: fetchCharacters,
    handleVariationDeleted,
  };
}
