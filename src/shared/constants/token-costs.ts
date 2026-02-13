export const TOKEN_TRANSACTION_TYPES = {
  signUpBonus: 'SIGN_UP_BONUS',
  adminAdjustment: 'ADMIN_ADJUSTMENT',
  projectCreation: 'PROJECT_CREATION',
  scriptRevision: 'SCRIPT_REVISION',
  audioRegeneration: 'AUDIO_REGENERATION',
  imageRegeneration: 'IMAGE_REGENERATION',
  imageRegenerationRefund: 'IMAGE_REGENERATION_REFUND',
  characterImage: 'CHARACTER_IMAGE',
  subscriptionCredit: 'SUBSCRIPTION_CREDIT',
} as const;

export type TokenTransactionType = typeof TOKEN_TRANSACTION_TYPES[keyof typeof TOKEN_TRANSACTION_TYPES];

export const TOKEN_COSTS = {
  signUpBonus: 90,
  perSecondProject: 1,
  minimumProjectSeconds: 30,
  actions: {
    scriptRevision: 10,
    audioRegeneration: 40,
    imageRegeneration: 1,
    characterImage: 10,
  },
} as const;

export const MINIMUM_PROJECT_TOKENS = TOKEN_COSTS.minimumProjectSeconds * TOKEN_COSTS.perSecondProject;

export function calculateProjectTokenCost(durationSeconds?: number | null) {
  const seconds = typeof durationSeconds === 'number' && durationSeconds > 0
    ? durationSeconds
    : TOKEN_COSTS.minimumProjectSeconds;
  const enforced = Math.max(seconds, TOKEN_COSTS.minimumProjectSeconds);
  return enforced * TOKEN_COSTS.perSecondProject;
}
