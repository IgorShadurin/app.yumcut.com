export const VOICE_PROVIDERS = [
  { id: 'inworld', label: 'Inworld' },
  { id: 'minimax', label: 'MiniMax' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
] as const;

export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number]['id'];

export const VOICE_PROVIDER_IDS = VOICE_PROVIDERS.map((provider) => provider.id) as VoiceProviderId[];

export const VOICE_PROVIDER_LABELS = VOICE_PROVIDERS.reduce((acc, provider) => {
  acc[provider.id] = provider.label;
  return acc;
}, {} as Record<VoiceProviderId, string>);

export const VOICE_PROVIDER_PRIORITY: VoiceProviderId[] = ['inworld', 'minimax', 'elevenlabs'];
export const FALLBACK_VOICE_PROVIDER_IDS: VoiceProviderId[] = ['minimax', 'inworld'];

export function normalizeVoiceProviderId(value: unknown): VoiceProviderId | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return VOICE_PROVIDER_IDS.includes(normalized as VoiceProviderId)
    ? (normalized as VoiceProviderId)
    : null;
}

export function buildVoiceProviderSet(values?: Iterable<string> | null): Set<VoiceProviderId> {
  const set = new Set<VoiceProviderId>();
  if (!values) return set;
  for (const entry of values) {
    const normalized = normalizeVoiceProviderId(entry);
    if (normalized) set.add(normalized);
  }
  return set;
}
