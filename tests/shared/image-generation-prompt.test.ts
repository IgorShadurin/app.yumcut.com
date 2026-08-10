import { describe, expect, it } from 'vitest';
import {
  buildImageGenerationPrompt,
  buildImagePrankPrompt,
  getRunwarePositivePromptValidationError,
  IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS,
  promptCharacterCount,
  RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS,
  runwareUserPromptMaxCharacters,
} from '@/shared/image-generation/prompt';

describe('Runware image prompt limits', () => {
  it('keeps a web Image Prank prompt within the provider limit at the advertised boundary', () => {
    const prompt = 'x'.repeat(IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS);
    const finalPrompt = buildImagePrankPrompt(prompt, false);

    expect(promptCharacterCount(finalPrompt)).toBe(RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS);
    expect(getRunwarePositivePromptValidationError(finalPrompt)).toBeNull();
    expect(getRunwarePositivePromptValidationError(buildImagePrankPrompt(`${prompt}x`, false))).not.toBeNull();
  });

  it('accounts for the extra mobile safety instruction in every image mode', () => {
    const standaloneMax = runwareUserPromptMaxCharacters(buildImageGenerationPrompt('', true));
    const prankMax = runwareUserPromptMaxCharacters(buildImagePrankPrompt('', true));

    expect(getRunwarePositivePromptValidationError(
      buildImageGenerationPrompt('x'.repeat(standaloneMax), true),
    )).toBeNull();
    expect(getRunwarePositivePromptValidationError(
      buildImageGenerationPrompt('x'.repeat(standaloneMax + 1), true),
    )).not.toBeNull();
    expect(getRunwarePositivePromptValidationError(
      buildImagePrankPrompt('x'.repeat(prankMax), true),
    )).toBeNull();
    expect(getRunwarePositivePromptValidationError(
      buildImagePrankPrompt('x'.repeat(prankMax + 1), true),
    )).not.toBeNull();
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(promptCharacterCount('a😀中')).toBe(3);
  });

  it('rejects a one-character standalone prompt using the provider minimum', () => {
    expect(getRunwarePositivePromptValidationError(buildImageGenerationPrompt('x', false)))
      .toContain('at least 2 characters');
  });
});
