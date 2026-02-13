import { z } from 'zod';
import { LIMITS } from '@/server/limits';
import { LANGUAGE_ENUM, LANGUAGE_CODES } from '@/shared/constants/languages';
import { SCHEDULER_CADENCE_OPTIONS } from '@/shared/constants/publish-scheduler';

export const allowedSettingsKeys = [
  'includeDefaultMusic',
  'addOverlay',
  'includeCallToAction',
  'autoApproveScript',
  'autoApproveAudio',
  'watermarkEnabled',
  'captionsEnabled',
  'defaultDurationSeconds',
  'sidebarOpen',
  'defaultUseScript',
  'targetLanguages',
  'scriptCreationGuidance',
  'scriptCreationGuidanceEnabled',
  'scriptAvoidanceGuidance',
  'scriptAvoidanceGuidanceEnabled',
  'audioStyleGuidance',
  'audioStyleGuidanceEnabled',
  'characterSelection',
  'preferredVoiceId',
  'languageVoicePreferences',
  'preferredTemplateId',
  'schedulerDefaultTimes',
  'schedulerCadence',
] as const;

const guidanceSchema = z
  .string()
  .max(LIMITS.scriptGuidanceMax, { message: `Guidance must be at most ${LIMITS.scriptGuidanceMax} characters` });

const audioStyleSchema = z
  .string()
  .max(LIMITS.audioStyleGuidanceMax, { message: `Audio style prompt must be at most ${LIMITS.audioStyleGuidanceMax} characters` });

const voiceIdSchema = z.string().min(1).max(128);
const languageVoicePreferencesSchema = z.record(
  z.string(),
  z.union([voiceIdSchema, z.null()]),
).superRefine((value, ctx) => {
  for (const key of Object.keys(value)) {
    if (!LANGUAGE_CODES.includes(key as any)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid language code: ${key}`, path: [key] });
    }
  }
});

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Use HH:MM format (UTC)' });
const cadenceEnum = z.enum(SCHEDULER_CADENCE_OPTIONS.map((item) => item.value) as [string, ...string[]]);

const characterSelectionValueSchema = z.union([
  z.object({ source: z.literal('dynamic') }),
  z.object({
    source: z.enum(['global', 'user']),
    variationId: z.string().uuid(),
    characterId: z.string().uuid().optional().nullable(),
    userCharacterId: z.string().uuid().optional().nullable(),
  }),
]);

export const patchSettingsSchema = z.discriminatedUnion('key', [
  z.object({
    key: z.literal('defaultDurationSeconds'),
    value: z.union([
      z.number().int().min(30, { message: 'Minimum duration is 30 seconds' }).max(1800, { message: 'Maximum duration is 30 minutes' }),
      z.null(),
    ]),
  }),
  z.object({ key: z.literal('defaultUseScript'), value: z.boolean() }),
  z.object({ key: z.literal('includeDefaultMusic'), value: z.boolean() }),
  z.object({ key: z.literal('addOverlay'), value: z.boolean() }),
  z.object({ key: z.literal('includeCallToAction'), value: z.boolean() }),
  z.object({ key: z.literal('autoApproveScript'), value: z.boolean() }),
  z.object({ key: z.literal('autoApproveAudio'), value: z.boolean() }),
  z.object({ key: z.literal('watermarkEnabled'), value: z.boolean() }),
  z.object({ key: z.literal('captionsEnabled'), value: z.boolean() }),
  z.object({ key: z.literal('sidebarOpen'), value: z.boolean() }),
  z.object({
    key: z.literal('targetLanguages'),
    value: z
      .array(LANGUAGE_ENUM)
      .min(1, { message: 'Select at least one language' }),
  }),
  z.object({ key: z.literal('scriptCreationGuidance'), value: guidanceSchema }),
  z.object({ key: z.literal('scriptCreationGuidanceEnabled'), value: z.boolean() }),
  z.object({ key: z.literal('scriptAvoidanceGuidance'), value: guidanceSchema }),
  z.object({ key: z.literal('scriptAvoidanceGuidanceEnabled'), value: z.boolean() }),
  z.object({ key: z.literal('audioStyleGuidance'), value: audioStyleSchema }),
  z.object({ key: z.literal('audioStyleGuidanceEnabled'), value: z.boolean() }),
  z.object({ key: z.literal('characterSelection'), value: z.union([characterSelectionValueSchema, z.null()]) }),
  z.object({ key: z.literal('preferredVoiceId'), value: z.union([z.string().min(1), z.null()]) }),
  z.object({ key: z.literal('languageVoicePreferences'), value: z.union([languageVoicePreferencesSchema, z.null()]) }),
  z.object({ key: z.literal('preferredTemplateId'), value: z.union([z.string().uuid(), z.null()]) }),
  z.object({
    key: z.literal('schedulerDefaultTimes'),
    value: z.record(LANGUAGE_ENUM, timeOfDaySchema),
  }),
  z.object({
    key: z.literal('schedulerCadence'),
    value: z.record(LANGUAGE_ENUM, cadenceEnum),
  }),
]);
