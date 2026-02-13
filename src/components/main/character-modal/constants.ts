import type { CharacterCollections, CharacterRecord } from './types';

export const INITIAL_COLLECTION: CharacterCollections = { global: [], mine: [] };

export const DYNAMIC_CHARACTER_RECORD: CharacterRecord = {
  id: '__dynamic__',
  title: 'Dynamic Character',
  description: 'We will generate a character from your story automatically.',
  variations: [
    {
      id: '__dynamic__',
      title: 'Auto-generate',
      description: 'Generated from project story',
      imageUrl: null,
      status: 'ready',
    },
  ],
};
