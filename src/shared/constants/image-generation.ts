export type ImageGenerationProviderId = 'runware';

export const DEFAULT_IMAGE_GENERATION_WIDTH = 1152;
export const DEFAULT_IMAGE_GENERATION_HEIGHT = 2048;
export const DEFAULT_IMAGE_GENERATION_SIZE_LABEL =
  `${DEFAULT_IMAGE_GENERATION_WIDTH}x${DEFAULT_IMAGE_GENERATION_HEIGHT}`;

export const DEFAULT_IMAGE_PRANK_GENERATION_MODEL = 'bytedance:seedream@4.5';
export const DEFAULT_IMAGE_PRANK_GENERATION_WIDTH = 1440;
export const DEFAULT_IMAGE_PRANK_GENERATION_HEIGHT = 2560;
export const DEFAULT_IMAGE_PRANK_GENERATION_SIZE_LABEL =
  `${DEFAULT_IMAGE_PRANK_GENERATION_WIDTH}x${DEFAULT_IMAGE_PRANK_GENERATION_HEIGHT}`;

export const IMAGE_PRANK_TWO_REFERENCE_MODELS = [
  DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
  'klingai:kling-image@o3',
  'bytedance:5@0',
  'alibaba:wan@2.7-image',
  'bfl:5@1',
  'krea:krea@2-medium',
  'prunaai:2@1',
  'google:nano-banana@2-lite',
  'krea:krea@2-turbo',
] as const;

export type ImagePrankGenerationModel = typeof IMAGE_PRANK_TWO_REFERENCE_MODELS[number];

export const IMAGE_PRANK_UI_MODEL_OPTIONS = [
  DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
  'klingai:kling-image@o3',
  'bytedance:5@0',
  'alibaba:wan@2.7-image',
  'prunaai:2@1',
  'google:nano-banana@2-lite',
] as const satisfies readonly ImagePrankGenerationModel[];

export type ImagePrankSelectableModel = typeof IMAGE_PRANK_UI_MODEL_OPTIONS[number];

export type ImagePrankSelectableModelOption = {
  id: ImagePrankSelectableModel;
  label: string;
  isDefault: boolean;
};

export const IMAGE_PRANK_SELECTABLE_MODEL_OPTIONS = [
  { id: DEFAULT_IMAGE_PRANK_GENERATION_MODEL, label: 'Default (Seedream)', isDefault: true },
  { id: 'klingai:kling-image@o3', label: 'Kling O3', isDefault: false },
  { id: 'bytedance:5@0', label: 'Bytedance 5', isDefault: false },
  { id: 'alibaba:wan@2.7-image', label: 'Alibaba Wan 2.7', isDefault: false },
  { id: 'prunaai:2@1', label: 'Pruna 2.1', isDefault: false },
  { id: 'google:nano-banana@2-lite', label: 'Nano Banana 2 Lite', isDefault: false },
] as const satisfies readonly ImagePrankSelectableModelOption[];

export function normalizeSelectableImagePrankGenerationModel(value: string | null | undefined): ImagePrankSelectableModel | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return IMAGE_PRANK_UI_MODEL_OPTIONS.find((model) => model === normalized) ?? null;
}

const IMAGE_PRANK_MODEL_DIMENSIONS: Record<ImagePrankGenerationModel, { width: number; height: number }> = {
  [DEFAULT_IMAGE_PRANK_GENERATION_MODEL]: {
    width: DEFAULT_IMAGE_PRANK_GENERATION_WIDTH,
    height: DEFAULT_IMAGE_PRANK_GENERATION_HEIGHT,
  },
  'klingai:kling-image@o3': { width: 2048, height: 2048 },
  'bytedance:5@0': { width: 1440, height: 2560 },
  'alibaba:wan@2.7-image': { width: DEFAULT_IMAGE_GENERATION_WIDTH, height: DEFAULT_IMAGE_GENERATION_HEIGHT },
  'bfl:5@1': { width: DEFAULT_IMAGE_GENERATION_WIDTH, height: DEFAULT_IMAGE_GENERATION_HEIGHT },
  'krea:krea@2-medium': { width: 928, height: 1152 },
  'prunaai:2@1': { width: 896, height: 1184 },
  'google:nano-banana@2-lite': { width: 768, height: 1376 },
  'krea:krea@2-turbo': { width: 928, height: 1152 },
};

const IMAGE_PRANK_DIMENSION_STEP = 16;

type ImagePrankGenerationDimensions = { width: number; height: number };

type ContinuousImagePrankDimensionConstraints = {
  kind: 'continuous';
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  step: number;
  minTotalPixels?: number;
  maxTotalPixels?: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
};

type PresetImagePrankDimensionConstraints = {
  kind: 'presets';
  sizes: readonly ImagePrankGenerationDimensions[];
};

type ImagePrankDimensionConstraints =
  | ContinuousImagePrankDimensionConstraints
  | PresetImagePrankDimensionConstraints;

const SEEDREAM_2K_PRESETS = [
  { width: 2048, height: 2048 },
  { width: 2304, height: 1728 },
  { width: 1728, height: 2304 },
  { width: 2560, height: 1440 },
  { width: 1440, height: 2560 },
  { width: 2496, height: 1664 },
  { width: 1664, height: 2496 },
  { width: 3024, height: 1296 },
] as const;

const KLING_O3_2K_PRESETS = [
  { width: 2048, height: 2048 },
  { width: 2496, height: 1664 },
  { width: 1664, height: 2496 },
  { width: 2368, height: 1760 },
  { width: 1760, height: 2368 },
  { width: 1536, height: 2720 },
  { width: 2720, height: 1536 },
  { width: 3136, height: 1344 },
] as const;

const KREA_MEDIUM_1K_PRESETS = [
  { width: 1024, height: 1024 },
  { width: 1184, height: 896 },
  { width: 1248, height: 832 },
  { width: 1376, height: 768 },
  { width: 1568, height: 672 },
  { width: 928, height: 1152 },
  { width: 832, height: 1248 },
  { width: 768, height: 1376 },
] as const;

const PRUNA_1K_PRESETS = [
  { width: 1024, height: 1024 },
  { width: 1184, height: 896 },
  { width: 896, height: 1184 },
  { width: 1376, height: 768 },
  { width: 768, height: 1376 },
  { width: 1248, height: 832 },
  { width: 832, height: 1248 },
] as const;

const NANO_BANANA_2_LITE_1K_PRESETS = [
  { width: 1024, height: 1024 },
  { width: 1264, height: 848 },
  { width: 848, height: 1264 },
  { width: 1200, height: 896 },
  { width: 896, height: 1200 },
  { width: 928, height: 1152 },
  { width: 1152, height: 928 },
  { width: 768, height: 1376 },
  { width: 1376, height: 768 },
  { width: 1584, height: 672 },
  { width: 2048, height: 512 },
  { width: 512, height: 2048 },
  { width: 3072, height: 384 },
  { width: 384, height: 3072 },
] as const;

// Runware model-specific output constraints, verified against the official model
// schemas on 2026-08-02. Preset-only models must receive an exact listed size.
const IMAGE_PRANK_MODEL_DIMENSION_CONSTRAINTS: Record<ImagePrankGenerationModel, ImagePrankDimensionConstraints> = {
  [DEFAULT_IMAGE_PRANK_GENERATION_MODEL]: {
    kind: 'continuous',
    minWidth: 256,
    maxWidth: 16_383,
    minHeight: 256,
    maxHeight: 16_383,
    step: IMAGE_PRANK_DIMENSION_STEP,
    minTotalPixels: 3_686_400,
    maxTotalPixels: 16_777_216,
    minAspectRatio: 1 / 16,
    maxAspectRatio: 16,
  },
  'klingai:kling-image@o3': { kind: 'presets', sizes: KLING_O3_2K_PRESETS },
  'bytedance:5@0': { kind: 'presets', sizes: SEEDREAM_2K_PRESETS },
  'alibaba:wan@2.7-image': {
    kind: 'continuous',
    minWidth: 768,
    maxWidth: 2048,
    minHeight: 768,
    maxHeight: 2048,
    step: IMAGE_PRANK_DIMENSION_STEP,
  },
  'bfl:5@1': {
    kind: 'continuous',
    minWidth: 256,
    maxWidth: 2048,
    minHeight: 256,
    maxHeight: 2048,
    step: IMAGE_PRANK_DIMENSION_STEP,
  },
  'krea:krea@2-medium': { kind: 'presets', sizes: KREA_MEDIUM_1K_PRESETS },
  'prunaai:2@1': { kind: 'presets', sizes: PRUNA_1K_PRESETS },
  'google:nano-banana@2-lite': { kind: 'presets', sizes: NANO_BANANA_2_LITE_1K_PRESETS },
  'krea:krea@2-turbo': {
    kind: 'continuous',
    minWidth: 64,
    maxWidth: 2048,
    minHeight: 64,
    maxHeight: 2048,
    step: IMAGE_PRANK_DIMENSION_STEP,
  },
};

export function normalizeImagePrankGenerationModel(value: string | null | undefined): ImagePrankGenerationModel | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return IMAGE_PRANK_TWO_REFERENCE_MODELS.find((model) => model === normalized) ?? null;
}

export function imagePrankGenerationDimensions(model: ImagePrankGenerationModel): { width: number; height: number } {
  return IMAGE_PRANK_MODEL_DIMENSIONS[model];
}

function aspectRatioDistance(size: ImagePrankGenerationDimensions, aspectRatio: number): number {
  return Math.abs(Math.log((size.width / size.height) / aspectRatio));
}

function pixelBudgetDistance(size: ImagePrankGenerationDimensions, pixelBudget: number): number {
  return Math.abs(Math.log((size.width * size.height) / pixelBudget));
}

function chooseClosestPreset(
  sizes: readonly ImagePrankGenerationDimensions[],
  aspectRatio: number,
  pixelBudget: number,
): ImagePrankGenerationDimensions {
  return sizes.reduce((best, candidate) => {
    const bestScore = aspectRatioDistance(best, aspectRatio) * 100 + pixelBudgetDistance(best, pixelBudget);
    const candidateScore = aspectRatioDistance(candidate, aspectRatio) * 100 + pixelBudgetDistance(candidate, pixelBudget);
    return candidateScore < bestScore ? candidate : best;
  });
}

function isContinuousSizeValid(
  size: ImagePrankGenerationDimensions,
  constraints: ContinuousImagePrankDimensionConstraints,
): boolean {
  const { width, height } = size;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return false;
  if (width < constraints.minWidth || width > constraints.maxWidth) return false;
  if (height < constraints.minHeight || height > constraints.maxHeight) return false;
  if (width % constraints.step !== 0 || height % constraints.step !== 0) return false;

  const totalPixels = width * height;
  if (constraints.minTotalPixels && totalPixels < constraints.minTotalPixels) return false;
  if (constraints.maxTotalPixels && totalPixels > constraints.maxTotalPixels) return false;

  const aspectRatio = width / height;
  if (constraints.minAspectRatio && aspectRatio < constraints.minAspectRatio) return false;
  if (constraints.maxAspectRatio && aspectRatio > constraints.maxAspectRatio) return false;
  return true;
}

function continuousAspectRange(constraints: ContinuousImagePrankDimensionConstraints) {
  return {
    min: Math.max(
      constraints.minAspectRatio ?? 0,
      constraints.minWidth / constraints.maxHeight,
    ),
    max: Math.min(
      constraints.maxAspectRatio ?? Number.POSITIVE_INFINITY,
      constraints.maxWidth / constraints.minHeight,
    ),
  };
}

function chooseContinuousSize(
  constraints: ContinuousImagePrankDimensionConstraints,
  aspectRatio: number,
  pixelBudget: number,
): ImagePrankGenerationDimensions | null {
  const range = continuousAspectRange(constraints);
  const targetAspectRatio = Math.min(range.max, Math.max(range.min, aspectRatio));
  const minWidth = Math.ceil(constraints.minWidth / constraints.step) * constraints.step;
  const maxWidth = Math.floor(constraints.maxWidth / constraints.step) * constraints.step;
  let best: ImagePrankGenerationDimensions | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let width = minWidth; width <= maxWidth; width += constraints.step) {
    const idealHeight = width / targetAspectRatio;
    const roundedHeight = Math.round(idealHeight / constraints.step) * constraints.step;
    const heightCandidates = [
      roundedHeight - constraints.step,
      roundedHeight,
      roundedHeight + constraints.step,
    ];

    for (const height of heightCandidates) {
      const candidate = { width, height };
      if (!isContinuousSizeValid(candidate, constraints)) continue;
      const score = aspectRatioDistance(candidate, targetAspectRatio) * 100
        + pixelBudgetDistance(candidate, pixelBudget);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return best;
}

export function getImagePrankGenerationSizeValidationError(
  model: ImagePrankGenerationModel,
  size: ImagePrankGenerationDimensions,
): string | null {
  const constraints = IMAGE_PRANK_MODEL_DIMENSION_CONSTRAINTS[model];
  if (constraints.kind === 'presets') {
    const supported = constraints.sizes.some(({ width, height }) => width === size.width && height === size.height);
    return supported ? null : `Unsupported ${model} image size ${size.width}x${size.height}.`;
  }

  if (!isContinuousSizeValid(size, constraints)) {
    return `Unsupported ${model} image size ${size.width}x${size.height}.`;
  }
  return null;
}

export function imagePrankGenerationDimensionsForAspect(
  model: ImagePrankGenerationModel,
  aspectRatio: number | null | undefined,
): { width: number; height: number } {
  const base = imagePrankGenerationDimensions(model);
  if (!Number.isFinite(aspectRatio) || !aspectRatio || aspectRatio <= 0) {
    return base;
  }

  const constraints = IMAGE_PRANK_MODEL_DIMENSION_CONSTRAINTS[model];
  const pixelBudget = base.width * base.height;
  if (constraints.kind === 'presets') {
    return chooseClosestPreset(constraints.sizes, aspectRatio, pixelBudget);
  }

  return chooseContinuousSize(constraints, aspectRatio, pixelBudget) ?? base;
}

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
