export const RUNWARE_POSITIVE_PROMPT_MIN_CHARACTERS = 2;
export const RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS = 3_000;

export const IMAGE_PRANK_SYSTEM_PROMPT = [
  'System instruction for Image Prank generation:',
  'Use the provided reference images in the exact order supplied.',
  'When two reference images are supplied, organically integrate the first reference image into the second reference image as the target scene or background.',
  'For two reference images, interpret "prank image", "first image", "image 1", or "first reference" as the first supplied image, and interpret "target image", "second image", "image 2", "background", or "target scene" as the second supplied image.',
  'Match perspective, scale, lighting direction, shadows, reflections, color temperature, depth of field, camera style, texture, grain, and natural occlusion so the result looks like a real single image, not a sticker, collage, or copy-paste.',
  'Preserve the target scene unless the user explicitly asks to change it.',
  'When one reference image is supplied, edit that image according to the user prompt while preserving its main subject and camera realism.',
  'For one reference image, interpret any mention of "the image", "this image", "reference image", "first image", or "target image" as the single supplied image.',
  'Do not add captions, text, UI, logos, watermarks, or random artifacts.',
].join('\n');

export const IOS_IMAGE_GENERATION_SAFETY_PROMPT = [
  'Mobile safety instruction:',
  'This request came from the iOS app. Generate only age-appropriate, non-explicit, non-NSFW imagery.',
  'Do not create nudity, explicit sexual content, pornographic or erotic framing, fetish content, lingerie or underwear focus, or sexualized minors.',
  'Keep clothing, pose, camera framing, and context safe for a general mobile audience.',
].join('\n');

const USER_PROMPT_SEPARATOR = '\n\nUser prompt:\n';

export function promptCharacterCount(value: string): number {
  return Array.from(value).length;
}

export function buildImageGenerationPrompt(userPrompt: string, blockNsfw: boolean): string {
  const trimmed = userPrompt.trim();
  return blockNsfw ? `${IOS_IMAGE_GENERATION_SAFETY_PROMPT}${USER_PROMPT_SEPARATOR}${trimmed}` : trimmed;
}

export function buildImagePrankPrompt(userPrompt: string, blockNsfw: boolean): string {
  const systemPrompt = blockNsfw
    ? `${IMAGE_PRANK_SYSTEM_PROMPT}\n${IOS_IMAGE_GENERATION_SAFETY_PROMPT}`
    : IMAGE_PRANK_SYSTEM_PROMPT;
  return `${systemPrompt}${USER_PROMPT_SEPARATOR}${userPrompt.trim()}`;
}

export function runwareUserPromptMaxCharacters(prefixWithEmptyUserPrompt: string): number {
  return Math.max(
    0,
    RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS - promptCharacterCount(prefixWithEmptyUserPrompt),
  );
}

export const IMAGE_PRANK_WEB_USER_PROMPT_MAX_CHARACTERS = runwareUserPromptMaxCharacters(
  buildImagePrankPrompt('', false),
);

export function getRunwarePositivePromptValidationError(prompt: string): string | null {
  const length = promptCharacterCount(prompt);
  if (length < RUNWARE_POSITIVE_PROMPT_MIN_CHARACTERS) {
    return `Image generation prompt must be at least ${RUNWARE_POSITIVE_PROMPT_MIN_CHARACTERS} characters.`;
  }
  if (length > RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS) {
    return `Image generation prompt must be at most ${RUNWARE_POSITIVE_PROMPT_MAX_CHARACTERS} characters after processing.`;
  }
  return null;
}
