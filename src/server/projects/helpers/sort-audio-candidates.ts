type DatedCandidate = { createdAt?: Date | string | null };

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Returns a new array sorted by `createdAt` descending.
 * Guards against missing or invalid timestamps so seeded data stays deterministic.
 */
export function sortAudioCandidatesByCreatedAtDesc<T extends DatedCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}
