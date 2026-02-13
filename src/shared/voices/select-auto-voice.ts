import { voiceSupportsLanguage } from '@/shared/voices/client-utils';
import { VOICE_PROVIDER_IDS } from '@/shared/constants/voice-providers';

export type AutoVoiceCandidate = {
  externalId: string | null;
  voiceProvider: string | null;
  languages: string | null;
  weight?: number | null;
  title?: string | null;
  description?: string | null;
  speed?: string | null;
  gender?: string | null;
};

const DEFAULT_ALLOWED_PROVIDERS = new Set(VOICE_PROVIDER_IDS);

export function selectAutoVoiceForLanguage(
  voices: AutoVoiceCandidate[],
  languageCode: string,
  options?: {
    allowedProviders?: ReadonlySet<string>;
  },
): AutoVoiceCandidate | null {
  const normalizedLanguage = (languageCode ?? '').toLowerCase();
  const allowedProviders = options?.allowedProviders ?? DEFAULT_ALLOWED_PROVIDERS;

  const candidates = voices
    .map((voice, index) => ({ voice, index }))
    .filter(({ voice }) => {
      if (!voice.externalId) return false;
      const provider = (voice.voiceProvider ?? '').toLowerCase();
      if (provider && !allowedProviders.has(provider)) return false;
      return voiceSupportsLanguage(voice, normalizedLanguage);
    })
    .sort((a, b) => {
      const weightDiff = (Number(b.voice.weight ?? 0) || 0) - (Number(a.voice.weight ?? 0) || 0);
      if (weightDiff !== 0) return weightDiff;

      const kidPenalty = (entry: { voice: AutoVoiceCandidate }) => {
        const text = `${entry.voice.title ?? ''} ${entry.voice.description ?? ''}`.toLowerCase();
        return /kid|child|boy|girl|teen/i.test(text) ? 1 : 0;
      };

      const genderScore = (entry: { voice: AutoVoiceCandidate }) => {
        const gender = (entry.voice.gender ?? '').toLowerCase();
        if (gender === 'male') return 0;
        if (gender === 'female') return 1;
        return 2;
      };

      const speedScore = (entry: { voice: AutoVoiceCandidate }) => {
        const speed = (entry.voice.speed ?? '').toLowerCase();
        return speed === 'fast' ? 0 : 1;
      };

      const kidDiff = kidPenalty(a) - kidPenalty(b);
      if (kidDiff !== 0) return kidDiff;

      const genderDiff = genderScore(a) - genderScore(b);
      if (genderDiff !== 0) return genderDiff;

      const speedDiff = speedScore(a) - speedScore(b);
      if (speedDiff !== 0) return speedDiff;

      if (a.index !== b.index) return a.index - b.index;
      return (a.voice.title ?? '').localeCompare(b.voice.title ?? '', undefined, { sensitivity: 'base' });
    });

  return candidates[0]?.voice ?? null;
}
