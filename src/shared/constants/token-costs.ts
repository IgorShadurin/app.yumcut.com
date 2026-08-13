import type { CharacterVideoQuality } from './character-video-quality';

export const TOKEN_TRANSACTION_TYPES = {
  signUpBonus: 'SIGN_UP_BONUS',
  emailReplyBonus: 'EMAIL_REPLY_BONUS',
  subscriptionWinbackBonus: 'SUBSCRIPTION_WINBACK_BONUS',
  adminAdjustment: 'ADMIN_ADJUSTMENT',
  projectCreation: 'PROJECT_CREATION',
  scriptRevision: 'SCRIPT_REVISION',
  imageGeneration: 'IMAGE_GENERATION',
  audioRegeneration: 'AUDIO_REGENERATION',
  imageRegeneration: 'IMAGE_REGENERATION',
  imageRegenerationRefund: 'IMAGE_REGENERATION_REFUND',
  projectFailureRefund: 'PROJECT_FAILURE_REFUND',
  characterImage: 'CHARACTER_IMAGE',
  subscriptionCredit: 'SUBSCRIPTION_CREDIT',
  tokenTopUp: 'TOKEN_TOP_UP',
} as const;

export type TokenTransactionType = typeof TOKEN_TRANSACTION_TYPES[keyof typeof TOKEN_TRANSACTION_TYPES];

export const TOKEN_COSTS = {
  signUpBonus: 90,
  emailReplyBonus: 30,
  subscriptionWinbackBonus: 100,
  perSecondProject: 1,
  minimumProjectSeconds: 30,
  characterProjects: {
    high: 75,
    low: 10,
  },
  actions: {
    scriptRevision: 10,
    imageGeneration: 3,
    audioRegeneration: 40,
    imageRegeneration: 1,
    characterImage: 10,
  },
} as const;

export const MINIMUM_PROJECT_TOKENS = TOKEN_COSTS.minimumProjectSeconds * TOKEN_COSTS.perSecondProject;
export const CHARACTER_PROJECT_TOKEN_COSTS = TOKEN_COSTS.characterProjects;
export const CHARACTER_PROJECT_CREATION_TOKENS = TOKEN_COSTS.characterProjects.high;

export function calculateProjectTokenCost(durationSeconds?: number | null) {
  const seconds = typeof durationSeconds === 'number' && durationSeconds > 0
    ? durationSeconds
    : TOKEN_COSTS.minimumProjectSeconds;
  const enforced = Math.max(seconds, TOKEN_COSTS.minimumProjectSeconds);
  return enforced * TOKEN_COSTS.perSecondProject;
}

export function calculateCharacterProjectTokenCost(quality?: CharacterVideoQuality | null) {
  return quality === 'low'
    ? TOKEN_COSTS.characterProjects.low
    : TOKEN_COSTS.characterProjects.high;
}
