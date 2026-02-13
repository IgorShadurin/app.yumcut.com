import { z } from 'zod';

export type TargetLanguageCode = 'en' | 'ru' | 'es' | 'fr' | 'de' | 'pt' | 'it';

export const LANGUAGES: { code: TargetLanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
];

export const DEFAULT_LANGUAGE: TargetLanguageCode = 'en';

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as TargetLanguageCode[];
export const LANGUAGE_ENUM = z.enum(LANGUAGE_CODES as [TargetLanguageCode, ...TargetLanguageCode[]]);

export function getLanguageLabel(code: string | null | undefined): string {
  const found = LANGUAGES.find((l) => l.code === code);
  return found ? found.label : (code || 'Unknown');
}

export const LANGUAGE_FLAGS: Record<TargetLanguageCode, string> = {
  en: '🇺🇸',
  ru: '🇷🇺',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
  pt: '🇵🇹',
  it: '🇮🇹',
};

export function getLanguageFlag(code: string | null | undefined): string {
  const key = (code as TargetLanguageCode) || DEFAULT_LANGUAGE;
  return LANGUAGE_FLAGS[key] ?? '🏳️';
}

export function normalizeLanguageList(
  input: unknown,
  fallback: TargetLanguageCode = DEFAULT_LANGUAGE,
): TargetLanguageCode[] {
  if (Array.isArray(input)) {
    const unique = Array.from(new Set(
      input
        .map((code) => typeof code === 'string' ? code.trim().toLowerCase() : '')
        .filter((code): code is TargetLanguageCode => (LANGUAGES as any).some((l: any) => l.code === code)),
    )) as TargetLanguageCode[];
    return unique.length > 0 ? unique : [fallback];
  }
  if (typeof input === 'string' && input.trim()) {
    const normalized = input.trim().toLowerCase();
    if ((LANGUAGES as any).some((l: any) => l.code === normalized)) {
      return [normalized as TargetLanguageCode];
    }
  }
  return [fallback];
}

export function resolvePrimaryLanguage(
  languages: TargetLanguageCode[] | null | undefined,
  fallback: TargetLanguageCode = DEFAULT_LANGUAGE,
): TargetLanguageCode {
  return Array.isArray(languages) && languages.length > 0 ? languages[0] : fallback;
}
