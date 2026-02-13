export type ImageSize = { width: number; height: number };

export type ImageSizeConstraints = {
  minTotalPixels: number;
  maxTotalPixels: number;
  sizeMultiple: number;
};

export function parseImageSize(value: string | null | undefined): ImageSize | null {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().toLowerCase().match(/^(\d{2,5})\s*x\s*(\d{2,5})$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function getImageSizeValidationError(size: ImageSize, constraints: ImageSizeConstraints): string | null {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return `Invalid image size ${width}x${height}. Width/height must be positive numbers.`;
  }
  if (width % constraints.sizeMultiple !== 0 || height % constraints.sizeMultiple !== 0) {
    return `Invalid image size ${width}x${height}. Width and height must be multiples of ${constraints.sizeMultiple} (Runware requirement).`;
  }
  const totalPixels = width * height;
  if (totalPixels < constraints.minTotalPixels || totalPixels > constraints.maxTotalPixels) {
    return `Invalid image size ${width}x${height}. Total pixels must be between ${constraints.minTotalPixels} and ${constraints.maxTotalPixels} (currently ${totalPixels}).`;
  }
  return null;
}
