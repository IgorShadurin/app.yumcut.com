export type CharacterSelection = {
  source?: 'global' | 'user' | 'dynamic';
  characterId?: string;
  userCharacterId?: string;
  variationId?: string;
  characterTitle?: string | null;
  variationTitle?: string | null;
  imageUrl?: string | null;
  status?: 'ready' | 'processing' | 'failed' | null;
};

export type CharacterVariationRecord = {
  id: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  status: 'ready' | 'processing' | 'failed';
};

export type CharacterRecord = {
  id: string;
  title: string;
  description: string | null;
  variations: CharacterVariationRecord[];
};

export type CharacterCollections = {
  global: CharacterRecord[];
  mine: CharacterRecord[];
};
