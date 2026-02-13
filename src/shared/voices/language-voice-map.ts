import { LANGUAGE_CODES, type TargetLanguageCode } from '@/shared/constants/languages';
import type { LanguageVoiceMap } from '@/shared/types';

export function normalizeLanguageVoiceMap(input: unknown): LanguageVoiceMap {
  const normalized: LanguageVoiceMap = {};
  if (!input || typeof input !== 'object') return normalized;
  for (const [code, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!LANGUAGE_CODES.includes(code as TargetLanguageCode)) continue;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        normalized[code as TargetLanguageCode] = trimmed;
      }
    } else if (raw === null) {
      normalized[code as TargetLanguageCode] = null;
    }
  }
  return normalized;
}

export function mergeLanguageVoicePreferences(base: LanguageVoiceMap, updates: LanguageVoiceMap): LanguageVoiceMap {
  const merged: LanguageVoiceMap = { ...base };
  for (const [code, raw] of Object.entries(updates)) {
    if (!LANGUAGE_CODES.includes(code as TargetLanguageCode)) continue;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        merged[code as TargetLanguageCode] = trimmed;
        continue;
      }
    }
    delete merged[code as TargetLanguageCode];
  }
  return merged;
}

export function selectVoiceForLanguage(map: LanguageVoiceMap | null | undefined, language: string): string | null {
  if (!map || typeof language !== 'string') return null;
  const normalized = language.trim().toLowerCase();
  if (!normalized) return null;
  const raw = (map as Record<string, string | null | undefined>)[normalized];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return null;
}

export function extractExplicitLanguageVoices(map: LanguageVoiceMap | null | undefined): LanguageVoiceMap {
  const normalized = normalizeLanguageVoiceMap(map ?? null);
  const explicit: LanguageVoiceMap = {};
  for (const [code, raw] of Object.entries(normalized)) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        explicit[code as TargetLanguageCode] = trimmed;
      }
    }
  }
  return explicit;
}
