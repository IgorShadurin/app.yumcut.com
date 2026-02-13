import type { getCreationSnapshot } from '../db';

export type CreationSnapshot = Awaited<ReturnType<typeof getCreationSnapshot>>;
