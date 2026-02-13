export type ImageGenerationProviderId = 'runware';

export type ImageGenerationModel = {
  id: string;
  label: string;
  provider: ImageGenerationProviderId;
};

export type ImageGenerationProvider = {
  id: ImageGenerationProviderId;
  label: string;
  models: ImageGenerationModel[];
};

export const IMAGE_GENERATION_PROVIDERS: ImageGenerationProvider[] = [
  {
    id: 'runware',
    label: 'Runware',
    models: [
      { id: 'runware:108@1', label: 'Qwen Image (base)', provider: 'runware' },
    ],
  },
] as const;

export function resolveImageProvider(id: string | null | undefined): ImageGenerationProvider | null {
  if (!id) return null;
  const normalized = id.trim().toLowerCase();
  return IMAGE_GENERATION_PROVIDERS.find((provider) => provider.id === normalized) ?? null;
}
