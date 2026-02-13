"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Api } from '@/lib/api-client';
import { DEFAULT_LANGUAGE, LANGUAGES, type TargetLanguageCode } from '@/shared/constants/languages';
import { selectAutoVoiceForLanguage } from '@/shared/voices/select-auto-voice';

export type VoiceOption = {
  id: string;
  title: string;
  description: string | null;
  externalId: string | null;
  languages: string | null;
  speed: 'fast' | 'slow' | null;
  gender: 'female' | 'male' | null;
  previewPath: string | null;
  voiceProvider: string | null;
  weight: number;
};

type AutoVoiceMap = Partial<Record<TargetLanguageCode, VoiceOption | null>>;

export function useVoices() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    Api.getVoices()
      .then((res) => {
        if (cancelled) return;
        const mapped = res.voices
          .map((voice) => ({
            id: voice.id,
            title: voice.title,
            description: voice.description ?? null,
            externalId: voice.externalId ?? null,
            languages: voice.languages ?? null,
            speed: (voice.speed as VoiceOption['speed']) ?? null,
            gender: (voice.gender as VoiceOption['gender']) ?? null,
            previewPath: voice.previewPath ?? null,
            voiceProvider: voice.voiceProvider ?? null,
            weight: typeof voice.weight === 'number' ? voice.weight : 0,
          }))
          .sort((a, b) => {
            if (a.weight !== b.weight) return b.weight - a.weight;
            return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
          });
        setVoices(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const autoVoices: AutoVoiceMap = useMemo(() => {
    const map: AutoVoiceMap = {};
    LANGUAGES.forEach((lang) => {
      map[lang.code] = selectAutoVoiceForLanguage(voices, lang.code) as VoiceOption | null;
    });
    return map;
  }, [voices]);

  const defaultVoiceId = useMemo(() => {
    const englishAuto = autoVoices[DEFAULT_LANGUAGE];
    if (englishAuto?.externalId) return englishAuto.externalId;
    const fastFemale = voices.find((voice) => voice.gender === 'female' && voice.speed === 'fast' && voice.externalId);
    if (fastFemale?.externalId) return fastFemale.externalId;
    const firstWithExternalId = voices.find((voice) => voice.externalId);
    return firstWithExternalId?.externalId ?? null;
  }, [autoVoices, voices]);

  const byExternalId = useMemo(() => {
    const map = new Map<string, VoiceOption>();
    voices.forEach((voice) => {
      if (voice.externalId) {
        map.set(voice.externalId, voice);
      }
    });
    return map;
  }, [voices]);

  const getByExternalId = useCallback(
    (id: string | null | undefined) => (id ? byExternalId.get(id) ?? null : null),
    [byExternalId]
  );

  const getAutoVoice = useCallback(
    (language: TargetLanguageCode | string | null | undefined) => {
      if (typeof language === 'string') {
        const normalized = language.trim().toLowerCase();
        if (LANGUAGES.some((lang) => lang.code === normalized)) {
          return autoVoices[normalized as TargetLanguageCode] ?? null;
        }
      }
      return autoVoices[DEFAULT_LANGUAGE] ?? null;
    },
    [autoVoices]
  );

  return { voices, loading, error, defaultVoiceId, getByExternalId, autoVoices, getAutoVoice };
}
