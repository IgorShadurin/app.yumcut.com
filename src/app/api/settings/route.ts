import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, error } from '@/server/http';
import { respondNormalizedError, withApiError } from '@/server/errors';
import { patchSettingsSchema } from '@/server/validators/settings';
import {
  parseStoredCharacterSelection,
  serializeStoredCharacterSelection,
  resolveCharacterSelectionSnapshot,
} from '@/server/characters/selection';
import {
  getDefaultVoiceExternalId,
  resolveVoiceExternalId,
  sanitizeLanguageVoicePreferences,
  sanitizePreferredVoiceId,
} from '@/server/voices';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { normalizeLanguageVoiceMap } from '@/shared/voices/language-voice-map';
import { ensureSchedulerPreferences } from '@/server/publishing/preferences';
import { getAdminVoiceProviderSettings } from '@/server/admin/voice-providers';
import { buildVoiceProviderSet } from '@/shared/constants/voice-providers';

export const GET = withApiError(async function GET() {
  const adminVoiceProviders = await getAdminVoiceProviderSettings();
  const allowedProviders = buildVoiceProviderSet(adminVoiceProviders.enabledProviders);
  const defaultVoiceId = await getDefaultVoiceExternalId({ allowedProviders });
  const session = await getAuthSession();
  if (!session?.user?.email || !(session.user as any).id) {
    // Return global defaults for unauthenticated users
    const scheduler = ensureSchedulerPreferences();
    return ok({
      includeDefaultMusic: true,
      addOverlay: true,
      includeCallToAction: true,
      autoApproveScript: true,
      autoApproveAudio: true,
      watermarkEnabled: true,
      captionsEnabled: true,
      defaultDurationSeconds: null,
      sidebarOpen: false,
      defaultUseScript: false,
      targetLanguages: ['en'],
      languageVoicePreferences: {},
      scriptCreationGuidanceEnabled: false,
      scriptCreationGuidance: '',
      scriptAvoidanceGuidanceEnabled: false,
      scriptAvoidanceGuidance: '',
      audioStyleGuidanceEnabled: false,
      audioStyleGuidance: '',
      characterSelection: null,
      preferredVoiceId: defaultVoiceId,
      preferredTemplateId: null,
      schedulerDefaultTimes: scheduler.times,
      schedulerCadence: scheduler.cadence,
    });
  }
  const userId = (session.user as any).id as string;
  // If the referenced user doesn't exist (e.g. after local DB reset but
  // browser still has a stale session), signal unauthorized so the client
  // can clear the stale session and start fresh.
  const existingUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!existingUser) {
    return unauthorized();
  }

  // Create settings if missing with a backend-initialized sidebarOpen value.
  // Rule: If user has no active (non-deleted) projects, default to closed; otherwise open.
  const activeCount = await prisma.project.count({ where: { userId, deleted: false } });
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    // If no active projects, enforce closed; otherwise do not change user's pref
    update: activeCount > 0 ? {} : { sidebarOpen: false },
    create: { userId, sidebarOpen: activeCount > 0, targetLanguages: ['en'], languageVoicePreferences: {} },
  });
  const storedSelection = parseStoredCharacterSelection((settings as any)?.preferredCharacter ?? null);
  let characterSelection = await resolveCharacterSelectionSnapshot({
    client: prisma,
    stored: storedSelection,
    userId,
  });
  if (!characterSelection) {
    characterSelection = { source: 'dynamic', status: 'processing', imageUrl: null } as any;
  }
  const normalizedLanguages = normalizeLanguageList((settings as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const storedLanguageVoices = normalizeLanguageVoiceMap((settings as any)?.languageVoicePreferences ?? null);
  const sanitizedLanguageVoices = await sanitizeLanguageVoicePreferences(storedLanguageVoices, { allowedProviders });
  const schedulerPrefs = ensureSchedulerPreferences((settings as any)?.schedulerDefaultTimes, (settings as any)?.schedulerCadence);
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
    // When there are no active projects, always return closed
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
  const session = await getAuthSession();
  if (!session?.user?.email || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;

  const json = await req.json();
  const parsed = patchSettingsSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid settings payload', 400, parsed.error.flatten());
  }
  const { key, value } = parsed.data;

  // If user record is missing (stale session after reset), require re-auth
  const existingUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!existingUser) return unauthorized();
  const needsVoiceProviderCheck = key === 'preferredVoiceId' || key === 'languageVoicePreferences';
  const adminVoiceProviders = needsVoiceProviderCheck ? await getAdminVoiceProviderSettings() : null;
  const allowedProviders = adminVoiceProviders ? buildVoiceProviderSet(adminVoiceProviders.enabledProviders) : null;

  const updateData: any = {};
  if (key === 'defaultDurationSeconds') updateData.defaultDurationSec = value;
  else if (key === 'defaultUseScript') updateData.defaultUseScript = value;
  else if (key === 'targetLanguages') {
    const normalized = normalizeLanguageList(value, DEFAULT_LANGUAGE);
    updateData.targetLanguages = normalized;
  }
  else if (key === 'scriptCreationGuidance') updateData.scriptCreationGuidance = value;
  else if (key === 'scriptCreationGuidanceEnabled') updateData.scriptCreationGuidanceEnabled = value;
  else if (key === 'scriptAvoidanceGuidance') updateData.scriptAvoidanceGuidance = value;
  else if (key === 'scriptAvoidanceGuidanceEnabled') updateData.scriptAvoidanceGuidanceEnabled = value;
  else if (key === 'audioStyleGuidance') updateData.audioStyleGuidance = value;
  else if (key === 'audioStyleGuidanceEnabled') updateData.audioStyleGuidanceEnabled = value;
  else if (key === 'watermarkEnabled') updateData.watermarkEnabled = value;
  else if (key === 'captionsEnabled') updateData.captionsEnabled = value;
  else if (key === 'includeCallToAction') updateData.includeCallToAction = value;
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
          return error('NOT_FOUND', 'Character variation not found', 404);
        }
      } else if (stored.source === 'user' && (stored as any).variationId) {
        const varId = (stored as any).variationId as string;
        const variation: any = await prisma.userCharacterVariation.findFirst({
          where: { id: varId, deleted: false, userCharacter: { deleted: false } },
          include: { userCharacter: true },
        });
        if (!variation || (variation.userCharacter && variation.userCharacter.userId !== userId)) {
          return error('FORBIDDEN', 'Character variation not accessible', 403);
        }
      }
      updateData.preferredCharacter = stored;
    }
  }
  else if (key === 'preferredVoiceId') {
    if (value === null) {
      updateData.preferredVoiceId = null;
    } else {
      const id = String(value);
      const resolvedVoiceId = await resolveVoiceExternalId(id, { allowedProviders: allowedProviders ?? undefined });
      if (!resolvedVoiceId) return error('VALIDATION_ERROR', 'Unknown voice id', 400);
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
  else if (key === 'preferredTemplateId') {
    if (value === null) {
      updateData.preferredTemplateId = null;
    } else {
      const id = String(value);
      const isAdmin = !!(session.user as any)?.isAdmin;
      const tpl = await prisma.template.findFirst({
        where: isAdmin ? { id } : { id, OR: [{ isPublic: true }, { ownerId: userId }] },
        select: { id: true },
      });
      if (!tpl) return error('VALIDATION_ERROR', 'Template not available', 400);
      updateData.preferredTemplateId = id;
    }
  }
  else if (key === 'schedulerDefaultTimes') updateData.schedulerDefaultTimes = value;
  else if (key === 'schedulerCadence') updateData.schedulerCadence = value;
  else updateData[key] = value;

  const activeCount2 = await prisma.project.count({ where: { userId, deleted: false } });
  const updated = await prisma.userSettings.upsert({
    where: { userId },
    update: updateData,
    create: { userId, sidebarOpen: activeCount2 > 0, ...updateData },
  });

  // Return only the updated key/value to minimize payloads
  if (key === 'defaultDurationSeconds') {
    return ok({ defaultDurationSeconds: updated.defaultDurationSec });
  }
  if (key === 'defaultUseScript') {
    return ok({ defaultUseScript: (updated as any).defaultUseScript });
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
    if (key === 'targetLanguages') {
      const normalized = normalizeLanguageList(
        (updated as any)?.targetLanguages ?? DEFAULT_LANGUAGE,
        DEFAULT_LANGUAGE,
      );
      return ok({
        targetLanguages: normalized,
      });
    }
  if (key === 'characterSelection') {
    const stored = parseStoredCharacterSelection((updated as any)?.preferredCharacter ?? null);
    const selection = await resolveCharacterSelectionSnapshot({ client: prisma, stored, userId });
    return ok({ characterSelection: selection });
  }
  if (key === 'preferredVoiceId') {
    return ok({ preferredVoiceId: (updated as any)?.preferredVoiceId ?? null } as any);
  }
  if (key === 'languageVoicePreferences') {
    return ok({ languageVoicePreferences: normalizeLanguageVoiceMap((updated as any)?.languageVoicePreferences ?? null) } as any);
  }
  if (key === 'preferredTemplateId') {
    return ok({ preferredTemplateId: (updated as any)?.preferredTemplateId ?? null } as any);
  }
  if (key === 'schedulerDefaultTimes' || key === 'schedulerCadence') {
    const prefs = ensureSchedulerPreferences((updated as any)?.schedulerDefaultTimes, (updated as any)?.schedulerCadence);
    return ok({
      schedulerDefaultTimes: prefs.times,
      schedulerCadence: prefs.cadence,
    });
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
  return ok({ [key]: value } as any);
}, 'Failed to update settings');
