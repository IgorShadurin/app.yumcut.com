export const LIMITS = {
  promptMax: 15_000,
  rawScriptMax: 10_000,
  // Provider-specific: Inworld exact-script input limit
  inworldExactScriptMax: 2_000,
  // Provider-specific: Minimax exact-script input limit
  minimaxExactScriptMax: 5_000,
  // Provider-specific: ElevenLabs exact-script input limit
  elevenlabsExactScriptMax: 5_100,
  approvedScriptMin: 300,
  scriptGuidanceMax: 4_000,
  audioStyleGuidanceMax: 500,
  imagePromptMax: 1_899,
  imageMinPixels: 1_024,
  imageMaxPixels: 1_048_576,
  imageSizeMultiple: 32,
  titleMax: 191,
  descriptionMax: 191,
  customCharacterPromptMax: 400,
  customCharacterDescriptionMax: 400,
} as const;
