import { z } from 'zod';
import { LIMITS } from '@/server/limits';

export const createGroupSchema = z.object({
  prompt: z.string().max(LIMITS.promptMax).optional().or(z.literal('')).transform((v) => v || undefined),
  rawScript: z.string().max(LIMITS.rawScriptMax).optional().or(z.literal('')).transform((v) => v || undefined),
  durationSeconds: z.number().int().min(1).max(60 * 60).optional(),
  useExactTextAsScript: z.boolean().optional().default(false),
  languageCode: z.string().min(2).max(8).optional().default('en'),
  characterSelection: z
    .object({
      characterId: z.string().max(36).optional(),
      userCharacterId: z.string().max(36).optional(),
      variationId: z.string().max(36).optional(),
    })
    .optional(),
  voiceId: z.string().max(128).optional().or(z.literal('')).transform((v) => v || undefined),
  settings: z.object({
    includeDefaultMusic: z.boolean(),
    addOverlay: z.boolean(),
    autoApproveScript: z.boolean(),
    autoApproveAudio: z.boolean(),
    watermarkEnabled: z.boolean(),
    captionsEnabled: z.boolean(),
    targetLanguage: z.string().min(2).max(8),
    scriptCreationGuidanceEnabled: z.boolean(),
    scriptCreationGuidance: z.string().max(LIMITS.scriptGuidanceMax),
    scriptAvoidanceGuidanceEnabled: z.boolean(),
    scriptAvoidanceGuidance: z.string().max(LIMITS.scriptGuidanceMax),
    audioStyleGuidanceEnabled: z.boolean(),
    audioStyleGuidance: z.string().max(LIMITS.audioStyleGuidanceMax),
  }),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
