import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
  IMAGE_PRANK_TWO_REFERENCE_MODELS,
  IMAGE_PRANK_UI_MODEL_OPTIONS,
  imagePrankGenerationDimensions,
  imagePrankGenerationDimensionsForAspect,
  getImagePrankGenerationSizeValidationError,
} from '@/shared/constants/image-generation';
import {
  getImagePrankModelCostMetadata,
  getSelectableImagePrankModelCostMetadata,
  listInternalImagePrankModelCosts,
  listInternalSelectableImagePrankModelCosts,
} from '@/server/image-generation/model-costs';

describe('image prank internal model costs', () => {
  it('stores private cost metadata for every supported two-reference model', () => {
    const costs = listInternalImagePrankModelCosts();
    expect(costs).toHaveLength(IMAGE_PRANK_TWO_REFERENCE_MODELS.length);

    for (const model of IMAGE_PRANK_TWO_REFERENCE_MODELS) {
      const metadata = getImagePrankModelCostMetadata(model);
      expect(metadata.model).toBe(model);
      expect(metadata.currency).toBe('USD');
      expect(metadata.unit).toBe('image_generation');
      expect(['runware_response_cost', 'runware_model_pricing']).toContain(metadata.source);
      expect(metadata.estimatedCostUsd).toBeGreaterThan(0);
      expect(metadata.evidence).toBeTruthy();
      expect(metadata.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('covers every user-selectable image prank model', () => {
    const selectableCosts = listInternalSelectableImagePrankModelCosts();
    expect(selectableCosts).toHaveLength(IMAGE_PRANK_UI_MODEL_OPTIONS.length);

    for (const model of IMAGE_PRANK_UI_MODEL_OPTIONS) {
      expect(getSelectableImagePrankModelCostMetadata(model).model).toBe(model);
    }
  });
});

describe('image prank generation dimensions', () => {
  it('keeps the default model size when no reference aspect is known', () => {
    expect(imagePrankGenerationDimensionsForAspect(DEFAULT_IMAGE_PRANK_GENERATION_MODEL, null)).toEqual(
      imagePrankGenerationDimensions(DEFAULT_IMAGE_PRANK_GENERATION_MODEL),
    );
  });

  it('preserves a non-9:16 target aspect instead of forcing portrait output', () => {
    const dimensions = imagePrankGenerationDimensionsForAspect(DEFAULT_IMAGE_PRANK_GENERATION_MODEL, 1500 / 2000);

    expect(dimensions.width / dimensions.height).toBeCloseTo(1500 / 2000, 2);
    expect(dimensions.width).not.toBe(1440);
    expect(dimensions.height).not.toBe(2560);
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(1440 * 2560 * 1.03);
  });

  it('keeps the reported narrow Seedream target above the provider pixel minimum', () => {
    const dimensions = imagePrankGenerationDimensionsForAspect(
      DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
      497 / 1080,
    );

    expect(dimensions.width / dimensions.height).toBeCloseTo(497 / 1080, 2);
    expect(dimensions.width * dimensions.height).toBeGreaterThanOrEqual(3_686_400);
    expect(getImagePrankGenerationSizeValidationError(
      DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
      dimensions,
    )).toBeNull();
  });

  it('rejects the undersized dimensions from the production failure before queueing', () => {
    expect(getImagePrankGenerationSizeValidationError(
      DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
      { width: 1184, height: 2560 },
    )).toContain('Unsupported');
  });

  it.each(IMAGE_PRANK_TWO_REFERENCE_MODELS)(
    'returns provider-eligible dimensions for every aspect with %s',
    (model) => {
      for (const aspectRatio of [null, 1, 497 / 1080, 1080 / 497, 1 / 16, 16, 1 / 100, 100]) {
        const dimensions = imagePrankGenerationDimensionsForAspect(model, aspectRatio);
        expect(
          getImagePrankGenerationSizeValidationError(model, dimensions),
          `${model} rejected ${dimensions.width}x${dimensions.height} for aspect ${aspectRatio}`,
        ).toBeNull();
      }
    },
  );
});
