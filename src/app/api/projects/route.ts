import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, unauthorized, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { createProjectSchema } from '@/server/validators/projects';
import { listPublicVoices, resolveVoiceInfo } from '@/server/voices';
import { LIMITS } from '@/server/limits';
import { deriveTitleFromText } from '@/server/title';
import { ProjectStatus } from '@/shared/constants/status';
import { spendTokens, makeUserInitiator, TOKEN_TRANSACTION_TYPES } from '@/server/tokens';
import { calculateProjectTokenCost, TOKEN_COSTS } from '@/shared/constants/token-costs';
import { notifyAdminsOfNewProject } from '@/server/telegram';
import { config } from '@/server/config';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { normalizeLanguageVoiceMap, mergeLanguageVoicePreferences } from '@/shared/voices/language-voice-map';
import { authenticateApiRequest } from '@/server/api-user';
import { selectAutoVoiceForLanguage } from '@/shared/voices/select-auto-voice';
import { validateProjectState } from '@/shared/projects';
import { normalizeTemplateCustomData, type TemplateCustomData } from '@/shared/templates/custom-data';
import { getAdminVoiceProviderSettings } from '@/server/admin/voice-providers';
import { buildVoiceProviderSet } from '@/shared/constants/voice-providers';
import { getProjectCreationSettings } from '@/server/admin/project-creation';

export const GET = withApiError(async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;
  const projects = await prisma.project.findMany({
    where: { userId, deleted: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  const trunc = (t: string) => (t.length > 30 ? t.slice(0, 27) + '...' : t);

  return ok(projects.map(p => ({
    id: p.id,
    title: trunc(p.title),
    status: p.status as ProjectStatus,
    createdAt: p.createdAt.toISOString(),
  })));
}, 'Failed to list projects');

export const POST = withApiError(async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;
  const projectCreationSettings = await getProjectCreationSettings();
  if (!projectCreationSettings.enabled) {
    return error(
      'PROJECT_CREATION_DISABLED',
      projectCreationSettings.disabledReason || 'Project creation is temporarily unavailable.',
      423,
      { reason: projectCreationSettings.disabledReason },
    );
  }
  const json = await req.json();
  const parsed = createProjectSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues?.[0]?.message || 'Invalid project payload';
    return error('VALIDATION_ERROR', first, 400, parsed.error.flatten());
  }
  const { prompt, rawScript, durationSeconds, characterSelection, useExactTextAsScript, templateId, voiceId, languages: requestedLanguages, languageVoices } = parsed.data;
  const dynamicCharacterRequested = (characterSelection as any)?.source === 'dynamic';
  const normalizedCharacterSelection = dynamicCharacterRequested ? null : characterSelection;
  const adminVoiceProviders = await getAdminVoiceProviderSettings();
  const allowedProviders = buildVoiceProviderSet(adminVoiceProviders.enabledProviders);

  if (
    normalizedCharacterSelection &&
    'userCharacterId' in normalizedCharacterSelection &&
    normalizedCharacterSelection?.userCharacterId
  ) {
    if (!normalizedCharacterSelection.variationId) {
      return error('VALIDATION_ERROR', 'Character variation is required', 400);
    }
    const variation = await prisma.userCharacterVariation.findFirst({
      where: {
        id: normalizedCharacterSelection.variationId,
        userCharacterId: normalizedCharacterSelection.userCharacterId,
        deleted: false,
        userCharacter: { userId, deleted: false },
      },
      select: { id: true },
    });
    if (!variation) {
      return error('VALIDATION_ERROR', 'Character variation not available', 400);
    }
  }

  const effectiveSeconds = Math.max(
    typeof durationSeconds === 'number' && durationSeconds > 0 ? durationSeconds : TOKEN_COSTS.minimumProjectSeconds,
    TOKEN_COSTS.minimumProjectSeconds,
  );
  const baseTokenCost = calculateProjectTokenCost(effectiveSeconds);

  const basisText = (useExactTextAsScript && rawScript) ? rawScript : (prompt || rawScript || 'Untitled Project');
  const title = deriveTitleFromText(basisText);

  // Create project
  let ownerName: string | null = auth.sessionUser?.name ?? null;
  let ownerEmail: string | null = auth.sessionUser?.email ?? null;
  let adminFlag = auth.sessionUser?.isAdmin ?? null;

  if (!ownerName || !ownerEmail || adminFlag == null) {
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, isAdmin: true } });
    ownerName = ownerName ?? dbUser?.name ?? null;
    ownerEmail = ownerEmail ?? dbUser?.email ?? null;
    adminFlag = adminFlag ?? dbUser?.isAdmin ?? false;
  }
  const isAdmin = !!adminFlag;
  // Validate template access if provided (outside transaction)
  let templateIdToUse: string | null = null;
  let templateCustomData: TemplateCustomData | null = null;
  if (templateId) {
    const tpl = await prisma.template.findFirst({
      where: isAdmin ? { id: templateId } : { id: templateId, OR: [ { isPublic: true }, { ownerId: userId } ] },
      select: { id: true, customData: true },
    });
    if (!tpl) {
      return error('VALIDATION_ERROR', 'Selected template is not available', 400);
    }
    templateIdToUse = tpl.id;
    templateCustomData = normalizeTemplateCustomData((tpl as any).customData ?? null);
  }

  let explicitVoiceSelection: { externalId: string; voiceProvider: string | null } | null = null;
  if (voiceId && typeof voiceId === 'string') {
    const resolvedVoice = await resolveVoiceInfo(voiceId, { allowedProviders });
    if (!resolvedVoice) {
      return error('VALIDATION_ERROR', 'Selected voice is not available', 400);
    }
    explicitVoiceSelection = resolvedVoice;
  }

  const userSettings = await prisma.userSettings.findUnique({ where: { userId } });
  const storedLanguages = normalizeLanguageList((userSettings as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const languagesList = normalizeLanguageList(
    requestedLanguages ?? storedLanguages,
    storedLanguages[0] ?? DEFAULT_LANGUAGE,
  );

  const storedLanguageVoices = normalizeLanguageVoiceMap((userSettings as any)?.languageVoicePreferences ?? null);
  const payloadLanguageVoices = normalizeLanguageVoiceMap(languageVoices ?? null);
  const combinedLanguageVoices = mergeLanguageVoicePreferences(storedLanguageVoices, payloadLanguageVoices);

  const publicVoices = await listPublicVoices({ allowedProviders });
  const resolvedVoiceCache = new Map<string, { externalId: string; voiceProvider: string | null } | null>();
  const projectLanguageVoiceAssignments: Record<string, string> = {};
  const projectLanguageVoiceProviders: Record<string, string> = {};
  const effectiveLanguageVoiceProviders: Record<string, string | null> = {};

  for (const languageCode of languagesList) {
    const candidate = combinedLanguageVoices[languageCode as keyof typeof combinedLanguageVoices];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const cacheKey = candidate.trim();
      let resolved = resolvedVoiceCache.get(cacheKey);
      if (resolved === undefined) {
        resolved = await resolveVoiceInfo(cacheKey, { allowedProviders });
        resolvedVoiceCache.set(cacheKey, resolved);
      }
      if (resolved?.externalId) {
        projectLanguageVoiceAssignments[languageCode] = resolved.externalId;
        if (resolved.voiceProvider) {
          projectLanguageVoiceProviders[languageCode] = resolved.voiceProvider;
        }
        effectiveLanguageVoiceProviders[languageCode] = resolved.voiceProvider ?? null;
      } else {
        effectiveLanguageVoiceProviders[languageCode] = null;
      }
      continue;
    }

    const autoVoice = selectAutoVoiceForLanguage(publicVoices, languageCode, { allowedProviders });
    effectiveLanguageVoiceProviders[languageCode] = autoVoice?.voiceProvider ?? null;
  }

  const validation = validateProjectState({
    mode: useExactTextAsScript ? 'script' : 'idea',
    text: useExactTextAsScript ? (rawScript ?? '') : (prompt ?? ''),
    enabledLanguages: languagesList,
    languageVoiceProvidersByLanguage: effectiveLanguageVoiceProviders,
    templateCustomData,
    limits: {
      inworldExactScriptMax: LIMITS.inworldExactScriptMax,
      minimaxExactScriptMax: LIMITS.minimaxExactScriptMax,
      elevenlabsExactScriptMax: LIMITS.elevenlabsExactScriptMax,
    },
  });

  if (validation.issues.length > 0) {
    const first = validation.issues[0]!.message;
    return error('VALIDATION_ERROR', first, 400, { issues: validation.issues });
  }

  const tokenCost = baseTokenCost * Math.max(languagesList.length, 1);

  const project = await prisma.$transaction(async (tx) => {
    await spendTokens({
      userId,
      amount: tokenCost,
      type: TOKEN_TRANSACTION_TYPES.projectCreation,
      description: `Project creation (${effectiveSeconds}s)` ,
      initiator: makeUserInitiator(userId),
      metadata: { durationSeconds: effectiveSeconds, languageCount: languagesList.length },
    }, tx);

    const created = await tx.project.create({
      data: {
        user: { connect: { id: userId } },
        title,
        prompt: prompt || null,
        rawScript: rawScript || null,
        languages: languagesList,
        languageVoiceAssignments: Object.keys(projectLanguageVoiceAssignments).length > 0 ? projectLanguageVoiceAssignments : undefined,
        languageVoiceProviders: Object.keys(projectLanguageVoiceProviders).length > 0 ? projectLanguageVoiceProviders : undefined,
        ...(templateIdToUse ? { template: { connect: { id: templateIdToUse } } } : {}),
        status: ProjectStatus.New,
      },
    });

    await Promise.all(
      languagesList.map((languageCode) =>
        tx.projectLanguageProgress.upsert({
          where: { projectId_languageCode: { projectId: created.id, languageCode } },
          update: {},
          create: { projectId: created.id, languageCode },
        }),
      ),
    );

    if (normalizedCharacterSelection && !('source' in normalizedCharacterSelection)) {
      const { characterId, userCharacterId, variationId } = normalizedCharacterSelection;
      await tx.projectCharacterSelection.create({
        data: {
          projectId: created.id,
          characterId: characterId || null,
          userCharacterId: userCharacterId || null,
          characterVariationId: characterId ? variationId || null : null,
          userCharacterVariationId: userCharacterId ? variationId || null : null,
        },
      });
    }

    const preferredVoiceId = (userSettings as any)?.preferredVoiceId as string | undefined;
    // Prefer an explicit voiceId from payload if provided and valid; fall back to user settings
    let selectedVoice: { externalId: string; voiceProvider: string | null } | null = explicitVoiceSelection;
    if (!selectedVoice && preferredVoiceId) {
      selectedVoice = await resolveVoiceInfo(preferredVoiceId, { allowedProviders });
    }
    if (selectedVoice?.externalId) {
      await tx.project.update({
        where: { id: created.id },
        data: {
          voiceId: selectedVoice.externalId,
          voiceProvider: selectedVoice.voiceProvider ?? null,
        },
      });
    }

    await tx.projectStatusHistory.create({
      data: { projectId: created.id, status: ProjectStatus.New },
    });

    const primaryLanguage = languagesList[0] ?? DEFAULT_LANGUAGE;

    await tx.job.create({
      data: {
        userId,
        projectId: created.id,
        type: 'script',
        status: 'queued',
        payload: {
          prompt: prompt || null,
          rawScript: rawScript || null,
          durationSeconds: effectiveSeconds,
          useExactTextAsScript: !!useExactTextAsScript,
          characterSelection: dynamicCharacterRequested
            ? { source: 'dynamic', status: 'processing' }
            : (normalizedCharacterSelection || null),
          ...(dynamicCharacterRequested ? { dynamicCharacter: true } : {}),
          includeDefaultMusic: userSettings?.includeDefaultMusic ?? true,
          addOverlay: userSettings?.addOverlay ?? true,
          includeCallToAction: (userSettings as any)?.includeCallToAction ?? true,
          autoApproveScript: userSettings?.autoApproveScript ?? true,
          autoApproveAudio: userSettings?.autoApproveAudio ?? true,
          watermarkEnabled: (userSettings as any)?.watermarkEnabled ?? true,
          captionsEnabled: (userSettings as any)?.captionsEnabled ?? true,
          targetLanguage: primaryLanguage,
          primaryLanguage,
          languages: languagesList,
          languageVoices: Object.keys(projectLanguageVoiceAssignments).length > 0 ? projectLanguageVoiceAssignments : undefined,
          languageVoiceProviders: Object.keys(projectLanguageVoiceProviders).length > 0 ? projectLanguageVoiceProviders : undefined,
          initiatorUserId: userId,
          scriptCreationGuidanceEnabled: !!(userSettings as any)?.scriptCreationGuidanceEnabled,
          scriptCreationGuidance:
            (userSettings as any)?.scriptCreationGuidanceEnabled
              ? ((userSettings as any)?.scriptCreationGuidance ?? '')
              : '',
          scriptAvoidanceGuidanceEnabled: !!(userSettings as any)?.scriptAvoidanceGuidanceEnabled,
          scriptAvoidanceGuidance:
            (userSettings as any)?.scriptAvoidanceGuidanceEnabled
              ? ((userSettings as any)?.scriptAvoidanceGuidance ?? '')
              : '',
          audioStyleGuidanceEnabled: !!(userSettings as any)?.audioStyleGuidanceEnabled,
          audioStyleGuidance:
            (userSettings as any)?.audioStyleGuidanceEnabled
              ? ((userSettings as any)?.audioStyleGuidance ?? '').slice(0, LIMITS.audioStyleGuidanceMax)
              : '',
          voiceId: selectedVoice?.externalId || null,
          voiceProvider: selectedVoice?.voiceProvider ?? null,
        },
      },
    });

    return created;
  });

  // Return a list-item shape so the client can optimistically update the sidebar
  const trunc = (t: string) => (t.length > 30 ? t.slice(0, 27) + '...' : t);

  const finalOwnerName = ownerName;
  const finalOwnerEmail = ownerEmail;
  let projectUrl: string | null = null;
  const base = config.NEXTAUTH_URL?.trim();
  if (base) {
    try {
      projectUrl = new URL(`/admin/projects/${project.id}`, base).toString();
    } catch {}
  }
  notifyAdminsOfNewProject({
    projectId: project.id,
    title: project.title,
    userId,
    userEmail: finalOwnerEmail,
    userName: finalOwnerName,
    projectUrl,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to notify admins about new project', err);
  });

  return ok({
    id: project.id,
    title: trunc(project.title),
    status: project.status as ProjectStatus,
    createdAt: project.createdAt.toISOString(),
  } satisfies import('@/shared/types').ProjectListItemDTO);
}, 'Failed to create project');
