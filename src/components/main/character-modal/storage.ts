const STORAGE_BASE_URL_RAW =
  process.env.NEXT_PUBLIC_STORAGE_BASE_URL?.trim() ||
  process.env.STORAGE_PUBLIC_URL?.trim() ||
  process.env.TEST_STORAGE_BASE_URL?.trim();

const SKIP_PRERENDER = process.env.SKIP_PRERENDER === '1' || process.env.CI === 'true';
const STORAGE_BASE_URL = STORAGE_BASE_URL_RAW || (SKIP_PRERENDER ? 'http://localhost:3333' : undefined);

export function resolveStorageBaseUrl(): string {
  if (!STORAGE_BASE_URL || STORAGE_BASE_URL.length === 0) {
    throw new Error('NEXT_PUBLIC_STORAGE_BASE_URL must be configured');
  }
  return STORAGE_BASE_URL.replace(/\/$/, '');
}
