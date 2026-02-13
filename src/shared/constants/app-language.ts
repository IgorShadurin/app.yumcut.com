export const APP_LANGUAGE_CODES = ['en', 'ru'] as const;

export type AppLanguageCode = (typeof APP_LANGUAGE_CODES)[number];

export const DEFAULT_APP_LANGUAGE: AppLanguageCode = 'en';

export const APP_LANGUAGE_STORAGE_KEY = 'yumcut.appLanguage';
export const APP_LANGUAGE_PENDING_AUTH_STORAGE_KEY = 'yumcut.pendingAuthLanguage';

export function parseAppLanguage(value: unknown): AppLanguageCode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return APP_LANGUAGE_CODES.includes(normalized as AppLanguageCode)
    ? (normalized as AppLanguageCode)
    : null;
}

export function normalizeAppLanguage(
  value: unknown,
  fallback: AppLanguageCode = DEFAULT_APP_LANGUAGE,
): AppLanguageCode {
  return parseAppLanguage(value) ?? fallback;
}
