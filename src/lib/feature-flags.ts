const truthy = new Set(['1', 'true', 'yes', 'on']);

function toFlag(value: string | undefined | null): boolean {
  if (!value) return false;
  return truthy.has(value.trim().toLowerCase());
}

export const features = {
  audioTonePromptEnabled: toFlag(process.env.NEXT_PUBLIC_ENABLE_AUDIO_TONE_PROMPT),
};
