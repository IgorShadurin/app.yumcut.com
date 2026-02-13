import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';

export function parseVoiceLanguages(languages: string | null): string[] {
  if (!languages) return [];
  return languages
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/_/g, '-'))
    .map((entry) => entry.split('-')[0]?.toLowerCase() || '')
    .filter((code) => code.length > 0);
}

export function voiceSupportsLanguage(voice: { languages: string | null }, languageCode: string | null): boolean {
  if (!languageCode) return true;
  const normalized = languageCode.toLowerCase();
  if (!voice.languages) return normalized === DEFAULT_LANGUAGE;
  const parsed = parseVoiceLanguages(voice.languages);
  if (!parsed.length) return normalized === DEFAULT_LANGUAGE;
  return parsed.some((lang) => lang === normalized);
}
