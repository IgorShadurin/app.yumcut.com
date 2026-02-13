import { NextRequest } from 'next/server';
import { withApiError, respondNormalizedError } from '@/server/errors';
import { ok, unauthorized, error, forbidden, notFound } from '@/server/http';
import { prisma } from '@/server/db';
import { authenticateApiRequest } from '@/server/api-user';
import {
  getDefaultVoiceExternalId,
  resolveVoiceExternalId,
  sanitizeLanguageVoicePreferences,
  sanitizePreferredVoiceId,
} from '@/server/voices';
import { patchSettingsSchema } from '@/server/validators/settings';
import { DEFAULT_LANGUAGE, normalizeLanguageList } from '@/shared/constants/languages';
import { normalizeLanguageVoiceMap } from '@/shared/voices/language-voice-map';
import {
  parseStoredCharacterSelection,
  resolveCharacterSelectionSnapshot,
  serializeStoredCharacterSelection,
} from '@/server/characters/selection';
import { ensureSchedulerPreferences } from '@/server/publishing/preferences';
import { getAdminVoiceProviderSettings } from '@/server/admin/voice-providers';
import { buildVoiceProviderSet } from '@/shared/constants/voice-providers';

export const GET = withApiError(async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();

  const userId = auth.userId;
  const adminVoiceProviders = await getAdminVoiceProviderSettings();
  const allowedProviders = buildVoiceProviderSet(adminVoiceProviders.enabledProviders);
  const defaultVoiceId = await getDefaultVoiceExternalId({ allowedProviders });
  const existingUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!existingUser) {
    return unauthorized();
  }

  const activeCount = await prisma.project.count({ where: { userId, deleted: false } });
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: activeCount > 0 ? {} : { sidebarOpen: false },
    create: { userId, sidebarOpen: activeCount > 0, targetLanguages: ['en'], languageVoicePreferences: {} },
  });

  const storedSelection = parseStoredCharacterSelection((settings as any)?.preferredCharacter ?? null);
  let characterSelection = await resolveCharacterSelectionSnapshot({ client: prisma, stored: storedSelection, userId });
  if (!characterSelection) {
    characterSelection = { source: 'dynamic', status: 'processing', imageUrl: null } as any;
  }

  const normalizedLanguages = normalizeLanguageList((settings as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const normalizedLanguageVoices = normalizeLanguageVoiceMap((settings as any)?.languageVoicePreferences ?? null);
  const schedulerPrefs = ensureSchedulerPreferences((settings as any)?.schedulerDefaultTimes, (settings as any)?.schedulerCadence);
  const sanitizedLanguageVoices = await sanitizeLanguageVoicePreferences(normalizedLanguageVoices, { allowedProviders });
  const sanitizedPreferredVoiceId =
    (await sanitizePreferredVoiceId((settings as any)?.preferredVoiceId ?? null, { allowedProviders }))
    ?? defaultVoiceId;
  return ok({
    includeDefaultMusic: settings.includeDefaultMusic,
    addOverlay: settings.addOverlay,
    includeCallToAction: (settings as any)?.includeCallToAction ?? true,
    autoApproveScript: settings.autoApproveScript,
    autoApproveAudio: settings.autoApproveAudio,
    watermarkEnabled: (settings as any)?.watermarkEnabled ?? true,
    captionsEnabled: (settings as any)?.captionsEnabled ?? true,
    defaultDurationSeconds: settings.defaultDurationSec,
    sidebarOpen: activeCount > 0
      ? ((settings as any).sidebarOpen ?? (settings as any).sidebarOpenMain ?? true)
      : false,
    defaultUseScript: (settings as any).defaultUseScript ?? false,
    targetLanguages: normalizedLanguages,
    languageVoicePreferences: sanitizedLanguageVoices,
    scriptCreationGuidanceEnabled: (settings as any).scriptCreationGuidanceEnabled ?? false,
    scriptCreationGuidance: (settings as any).scriptCreationGuidance ?? '',
    scriptAvoidanceGuidanceEnabled: (settings as any).scriptAvoidanceGuidanceEnabled ?? false,
    scriptAvoidanceGuidance: (settings as any).scriptAvoidanceGuidance ?? '',
    audioStyleGuidanceEnabled: (settings as any).audioStyleGuidanceEnabled ?? false,
    audioStyleGuidance: (settings as any).audioStyleGuidance ?? '',
    characterSelection,
    preferredVoiceId: sanitizedPreferredVoiceId,
    preferredTemplateId: (settings as any)?.preferredTemplateId ?? null,
    schedulerDefaultTimes: schedulerPrefs.times,
    schedulerCadence: schedulerPrefs.cadence,
  });
}, 'Failed to load settings');

export const PATCH = withApiError(async function PATCH(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;

  const json = await req.json();
  const parsed = patchSettingsSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid settings payload', 400, parsed.error.format());
  }

  const { key, value } = parsed.data;
  const needsVoiceProviderCheck = key === 'preferredVoiceId' || key === 'languageVoicePreferences';
  const adminVoiceProviders = needsVoiceProviderCheck ? await getAdminVoiceProviderSettings() : null;
  const allowedProviders = adminVoiceProviders ? buildVoiceProviderSet(adminVoiceProviders.enabledProviders) : null;

  const updateData: Record<string, any> = {};
  if (key === 'defaultDurationSeconds') updateData.defaultDurationSec = value ?? null;
  else if (key === 'defaultUseScript') updateData.defaultUseScript = value;
  else if (key === 'includeDefaultMusic') updateData.includeDefaultMusic = value;
  else if (key === 'addOverlay') updateData.addOverlay = value;
  else if (key === 'includeCallToAction') updateData.includeCallToAction = value;
  else if (key === 'autoApproveScript') updateData.autoApproveScript = value;
  else if (key === 'autoApproveAudio') updateData.autoApproveAudio = value;
  else if (key === 'watermarkEnabled') updateData.watermarkEnabled = value;
  else if (key === 'captionsEnabled') updateData.captionsEnabled = value;
  else if (key === 'targetLanguages') updateData.targetLanguages = value;
  else if (key === 'scriptCreationGuidance') updateData.scriptCreationGuidance = value;
  else if (key === 'scriptCreationGuidanceEnabled') updateData.scriptCreationGuidanceEnabled = value;
  else if (key === 'scriptAvoidanceGuidance') updateData.scriptAvoidanceGuidance = value;
  else if (key === 'scriptAvoidanceGuidanceEnabled') updateData.scriptAvoidanceGuidanceEnabled = value;
  else if (key === 'audioStyleGuidance') updateData.audioStyleGuidance = value;
  else if (key === 'audioStyleGuidanceEnabled') updateData.audioStyleGuidanceEnabled = value;
  else if (key === 'preferredTemplateId') updateData.preferredTemplateId = value;
  else if (key === 'preferredVoiceId') {
    if (value === null) {
      updateData.preferredVoiceId = null;
    } else {
      const resolvedVoiceId = await resolveVoiceExternalId(String(value), { allowedProviders: allowedProviders ?? undefined });
      if (!resolvedVoiceId) {
        return error('VALIDATION_ERROR', 'Unknown voice selection', 400);
      }
      updateData.preferredVoiceId = resolvedVoiceId;
    }
  }
  else if (key === 'languageVoicePreferences') {
    const normalizedMap = normalizeLanguageVoiceMap(value ?? {});
    const sanitized = allowedProviders
      ? await sanitizeLanguageVoicePreferences(normalizedMap, { allowedProviders })
      : normalizedMap;
    updateData.languageVoicePreferences = sanitized;
  }
  else if (key === 'schedulerDefaultTimes') updateData.schedulerDefaultTimes = value;
  else if (key === 'schedulerCadence') updateData.schedulerCadence = value;
  else if (key === 'characterSelection') {
    if (value === null) {
      updateData.preferredCharacter = null;
    } else {
      const stored = serializeStoredCharacterSelection(value);
      if (!stored) {
        return error('VALIDATION_ERROR', 'Invalid character selection', 400);
      }
      if ((stored as any).source !== 'dynamic' && !(stored as any).variationId) {
        return error('VALIDATION_ERROR', 'Missing variation id', 400);
      }
      if (stored.source === 'global' && (stored as any).variationId) {
        const varId = (stored as any).variationId as string;
        const variation = await prisma.characterVariation.findUnique({ where: { id: varId } });
        if (!variation) {
          return notFound('Character variation not found');
        }
      } else if (stored.source === 'user' && (stored as any).variationId) {
        const varId = (stored as any).variationId as string;
        const variation: any = await prisma.userCharacterVariation.findFirst({
          where: { id: varId, deleted: false, userCharacter: { deleted: false } },
          include: { userCharacter: true },
        });
        if (!variation || (variation.userCharacter && variation.userCharacter.userId !== userId)) {
          return forbidden('Character variation not accessible');
        }
      }
      updateData.preferredCharacter = stored;
    }
  } else {
    updateData[key] = value;
  }

  const activeProjectCount = await prisma.project.count({ where: { userId, deleted: false } });

  try {
    const updated = await prisma.userSettings.upsert({
      where: { userId },
      update: updateData,
      create: { userId, sidebarOpen: activeProjectCount > 0, ...updateData },
    });

    if (key === 'targetLanguages') {
      const normalized = normalizeLanguageList(
        (updated as any)?.targetLanguages ?? DEFAULT_LANGUAGE,
        DEFAULT_LANGUAGE,
      );
      return ok({ targetLanguages: normalized });
    }
    if (key === 'schedulerDefaultTimes' || key === 'schedulerCadence') {
      const prefs = ensureSchedulerPreferences((updated as any)?.schedulerDefaultTimes, (updated as any)?.schedulerCadence);
      return ok({
        schedulerDefaultTimes: prefs.times,
        schedulerCadence: prefs.cadence,
      });
    }
    if (key === 'characterSelection') {
      const stored = parseStoredCharacterSelection((updated as any)?.preferredCharacter ?? null);
      const selection = await resolveCharacterSelectionSnapshot({ client: prisma, stored, userId });
      return ok({ characterSelection: selection });
    }
    if (key === 'preferredVoiceId') {
      return ok({ preferredVoiceId: (updated as any)?.preferredVoiceId ?? null });
    }
    if (key === 'languageVoicePreferences') {
      return ok({ languageVoicePreferences: normalizeLanguageVoiceMap((updated as any)?.languageVoicePreferences ?? null) });
    }
    if (key === 'preferredTemplateId') {
      return ok({ preferredTemplateId: (updated as any)?.preferredTemplateId ?? null });
    }
    if (key === 'watermarkEnabled') {
      return ok({ watermarkEnabled: !!(updated as any).watermarkEnabled });
    }
    if (key === 'captionsEnabled') {
      return ok({ captionsEnabled: !!(updated as any).captionsEnabled });
    }
    if (key === 'includeCallToAction') {
      return ok({ includeCallToAction: !!(updated as any).includeCallToAction });
    }
    if (key === 'scriptCreationGuidance') {
      return ok({ scriptCreationGuidance: (updated as any).scriptCreationGuidance ?? '' });
    }
    if (key === 'scriptCreationGuidanceEnabled') {
      return ok({ scriptCreationGuidanceEnabled: !!(updated as any).scriptCreationGuidanceEnabled });
    }
    if (key === 'scriptAvoidanceGuidance') {
      return ok({ scriptAvoidanceGuidance: (updated as any).scriptAvoidanceGuidance ?? '' });
    }
    if (key === 'scriptAvoidanceGuidanceEnabled') {
      return ok({ scriptAvoidanceGuidanceEnabled: !!(updated as any).scriptAvoidanceGuidanceEnabled });
    }
    if (key === 'audioStyleGuidance') {
      return ok({ audioStyleGuidance: (updated as any).audioStyleGuidance ?? '' });
    }
    if (key === 'audioStyleGuidanceEnabled') {
      return ok({ audioStyleGuidanceEnabled: !!(updated as any).audioStyleGuidanceEnabled });
    }
    return ok({ [key]: value } as any);
  } catch (err: any) {
    return respondNormalizedError(err, 'Failed to update settings');
  }
}, 'Failed to update settings');
