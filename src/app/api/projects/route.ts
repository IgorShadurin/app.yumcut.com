import { NextRequest } from 'next/server';
import path from 'path';
import sharp, { type Metadata } from 'sharp';
import { prisma } from '@/server/db';
import { ok, unauthorized, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { createProjectSchema } from '@/server/validators/projects';
import { listPublicVoices, resolveVoiceInfo } from '@/server/voices';
import { LIMITS } from '@/server/limits';
import { deriveTitleFromText } from '@/server/title';
import { ProjectStatus } from '@/shared/constants/status';
import {
  DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
  DEFAULT_IMAGE_GENERATION_HEIGHT,
  DEFAULT_IMAGE_GENERATION_WIDTH,
  type ImagePrankGenerationModel,
  imagePrankGenerationDimensionsForAspect,
  getImagePrankGenerationSizeValidationError,
  normalizeSelectableImagePrankGenerationModel,
} from '@/shared/constants/image-generation';
import { spendTokens, makeUserInitiator, TOKEN_TRANSACTION_TYPES } from '@/server/tokens';
import { calculateCharacterProjectTokenCost, calculateProjectTokenCost, TOKEN_COSTS } from '@/shared/constants/token-costs';
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
import { sendProjectCreatedEmail } from '@/server/emails/project-lifecycle';
import { normalizeProjectExperience } from '@/shared/constants/project-experience';
import { normalizeContentTone } from '@/shared/constants/content-tone';
import { defaultCharacterVideoGeneration } from '@/shared/constants/video-generation';
import { CHARACTER_PROJECT_TARGET_DURATION_SECONDS } from '@/shared/constants/character-project';
import { linkProjectCreationAttemptToProject } from '@/server/analytics/project-attempts';
import { getPublicImagePrankItemById } from '@/server/image-pranks';
import { mediaRoot, normalizeMediaUrl, toStoredMediaPath } from '@/server/storage';
import type {
  ImagePrankCatalogItemDTO,
  ImagePrankMode,
  ImagePrankSourceImageDTO,
  ImagePrankSourceImageRole,
} from '@/shared/types';
import {
  CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE,
  type CharacterVideoGenerationMode,
  DEFAULT_CHARACTER_VIDEO_QUALITY,
  normalizeCharacterVideoGenerationMode,
  normalizeCharacterVideoQuality,
  qualityForVideoGenerationMode,
} from '@/shared/constants/character-video-quality';

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
  const {
    prompt,
    rawScript,
    durationSeconds,
    characterSelection,
    characterSlug,
    useExactTextAsScript,
    templateId,
    creationAttemptId,
    voiceId,
    languages: requestedLanguages,
    languageVoices,
    videoGeneration,
    characterVideoQuality,
    projectExperience,
    imagePrank,
    contentTone,
    includeDefaultMusic,
    addOverlay,
    includeCallToAction,
    watermarkEnabled,
    captionsEnabled,
  } = parsed.data;
  const normalizedProjectExperience = normalizeProjectExperience(projectExperience);
  if (normalizedProjectExperience === 'image-generation') {
    return createImageGenerationProject({
      userId,
      auth,
      prompt: prompt ?? '',
      characterSelection,
      characterSlug,
      imagePrank,
      creationAttemptId,
    });
  }
  const isCharacterExperience = normalizedProjectExperience === 'character';
  const requestedDurationSeconds = isCharacterExperience
    ? CHARACTER_PROJECT_TARGET_DURATION_SECONDS
    : (typeof durationSeconds === 'number' && durationSeconds > 0
      ? durationSeconds
      : TOKEN_COSTS.minimumProjectSeconds);
  const payloadVideoGenerationMode = normalizeCharacterVideoGenerationMode(videoGeneration?.mode);
  const effectiveCharacterVideoQuality = isCharacterExperience
    ? (payloadVideoGenerationMode
      ? qualityForVideoGenerationMode(payloadVideoGenerationMode)
      : normalizeCharacterVideoQuality(characterVideoQuality))
    : DEFAULT_CHARACTER_VIDEO_QUALITY;
  const effectiveVideoGeneration = isCharacterExperience
    ? buildCharacterVideoGeneration({
        mode: payloadVideoGenerationMode
          ?? CHARACTER_VIDEO_QUALITY_TO_GENERATION_MODE[effectiveCharacterVideoQuality],
        lipsyncPrompt: videoGeneration?.lipsyncPrompt,
      })
    : undefined;
  const normalizedContentTone = normalizeContentTone(contentTone);
  const normalizedCharacterSlug =
    typeof characterSlug === 'string' && characterSlug.trim().length > 0
      ? characterSlug.trim().toLowerCase()
      : null;
  if (normalizedCharacterSlug && characterSelection) {
    return error('VALIDATION_ERROR', 'Use either character selection or character slug, not both', 400);
  }
  let characterDefaultVoiceId: string | null = null;
  let slugBasedCharacterSelection: { characterId: string; variationId?: string } | null = null;
  if (normalizedCharacterSlug) {
    const catalogCharacter = await prisma.character.findFirst({
      where: {
        slug: normalizedCharacterSlug,
        isCatalogPublic: true,
      },
      select: {
        id: true,
        defaultVoiceId: true,
        variations: {
          orderBy: [{ priority: 'desc' }, { id: 'asc' }],
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!catalogCharacter) {
      return error('VALIDATION_ERROR', 'Character is not available', 400);
    }
    characterDefaultVoiceId = catalogCharacter.defaultVoiceId ?? null;
    slugBasedCharacterSelection = {
      characterId: catalogCharacter.id,
      ...(catalogCharacter.variations[0]?.id ? { variationId: catalogCharacter.variations[0].id } : {}),
    };
  }
  const dynamicCharacterRequested = (characterSelection as any)?.source === 'dynamic';
  const snapshotCharacterSelection = (characterSelection as any)?.source === 'snapshot'
    ? {
        source: 'snapshot',
        imageUrl: (characterSelection as any).imageUrl ?? null,
        imagePath: (characterSelection as any).imagePath ?? null,
        label: (characterSelection as any).label ?? null,
      }
    : null;
  if (snapshotCharacterSelection && auth.source !== 'admin-api') {
    return error('VALIDATION_ERROR', 'Snapshot character selection is only available to the admin API', 400);
  }
  const normalizedCharacterSelection = dynamicCharacterRequested
    ? null
    : (snapshotCharacterSelection ? null : (slugBasedCharacterSelection || characterSelection || null));
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
    requestedDurationSeconds,
    TOKEN_COSTS.minimumProjectSeconds,
  );
  const baseTokenCost = calculateProjectTokenCost(effectiveSeconds);

  const basisText = (useExactTextAsScript && rawScript) ? rawScript : (prompt || rawScript || 'Untitled Project');
  const title = normalizedProjectExperience === 'character'
    ? deriveTitleFromText(basisText, 20)
    : deriveTitleFromText(basisText);

  // Create project
  let ownerName: string | null = auth.sessionUser?.name ?? null;
  let ownerEmail: string | null = auth.sessionUser?.email ?? null;
  let ownerPreferredLanguage: string | null = (auth.sessionUser as any)?.preferredLanguage ?? null;
  let adminFlag = auth.sessionUser?.isAdmin ?? null;

  if (!ownerName || !ownerEmail || !ownerPreferredLanguage || adminFlag == null) {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, preferredLanguage: true, isAdmin: true },
    });
    ownerName = ownerName ?? dbUser?.name ?? null;
    ownerEmail = ownerEmail ?? dbUser?.email ?? null;
    ownerPreferredLanguage = ownerPreferredLanguage ?? dbUser?.preferredLanguage ?? null;
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

  const tokenCost = isCharacterExperience
    ? calculateCharacterProjectTokenCost(effectiveCharacterVideoQuality)
    : baseTokenCost * Math.max(languagesList.length, 1);

  const project = await prisma.$transaction(async (tx) => {
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
        contentTone: normalizedContentTone,
      },
    });

    await spendTokens({
      userId,
      amount: tokenCost,
      type: TOKEN_TRANSACTION_TYPES.projectCreation,
      description: isCharacterExperience
        ? `Project creation (character ${effectiveCharacterVideoQuality} quality)`
        : `Project creation (${effectiveSeconds}s)`,
      initiator: makeUserInitiator(userId),
      metadata: {
        projectId: created.id,
        durationSeconds: effectiveSeconds,
        languageCount: languagesList.length,
        ...(isCharacterExperience
          ? {
              characterVideoQuality: effectiveCharacterVideoQuality,
              videoGenerationMode: effectiveVideoGeneration?.mode ?? null,
            }
          : {}),
      },
    }, tx);

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
      const { characterId, userCharacterId, variationId } = normalizedCharacterSelection as {
        characterId?: string;
        userCharacterId?: string;
        variationId?: string;
      };
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
    if (!selectedVoice && characterDefaultVoiceId) {
      selectedVoice = await resolveVoiceInfo(characterDefaultVoiceId, { allowedProviders });
    }
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
          durationSeconds: requestedDurationSeconds,
          useExactTextAsScript: !!useExactTextAsScript,
          characterSelection: dynamicCharacterRequested
            ? { source: 'dynamic', status: 'processing' }
            : snapshotCharacterSelection
              ? snapshotCharacterSelection
            : (normalizedCharacterSelection || null),
          characterSlug: normalizedCharacterSlug ?? undefined,
          ...(dynamicCharacterRequested ? { dynamicCharacter: true } : {}),
          includeDefaultMusic: isCharacterExperience
            ? (includeDefaultMusic ?? false)
            : (userSettings?.includeDefaultMusic ?? true),
          addOverlay: isCharacterExperience
            ? (addOverlay ?? false)
            : (userSettings?.addOverlay ?? true),
          includeCallToAction: isCharacterExperience
            ? (includeCallToAction ?? true)
            : ((userSettings as any)?.includeCallToAction ?? true),
          autoApproveScript: isCharacterExperience
            ? true
            : (userSettings?.autoApproveScript ?? true),
          autoApproveAudio: isCharacterExperience
            ? true
            : (userSettings?.autoApproveAudio ?? true),
          watermarkEnabled: isCharacterExperience
            ? (watermarkEnabled ?? false)
            : ((userSettings as any)?.watermarkEnabled ?? true),
          captionsEnabled: isCharacterExperience
            ? (captionsEnabled ?? true)
            : ((userSettings as any)?.captionsEnabled ?? true),
          targetLanguage: primaryLanguage,
          primaryLanguage,
          languages: languagesList,
          languageVoices: Object.keys(projectLanguageVoiceAssignments).length > 0 ? projectLanguageVoiceAssignments : undefined,
          languageVoiceProviders: Object.keys(projectLanguageVoiceProviders).length > 0 ? projectLanguageVoiceProviders : undefined,
          videoGeneration: effectiveVideoGeneration,
          characterVideoQuality: isCharacterExperience ? effectiveCharacterVideoQuality : undefined,
          initiatorUserId: userId,
          scriptCreationGuidanceEnabled: isCharacterExperience
            ? false
            : !!(userSettings as any)?.scriptCreationGuidanceEnabled,
          scriptCreationGuidance:
            !isCharacterExperience && (userSettings as any)?.scriptCreationGuidanceEnabled
              ? ((userSettings as any)?.scriptCreationGuidance ?? '')
              : '',
          scriptAvoidanceGuidanceEnabled: isCharacterExperience
            ? false
            : !!(userSettings as any)?.scriptAvoidanceGuidanceEnabled,
          scriptAvoidanceGuidance:
            !isCharacterExperience && (userSettings as any)?.scriptAvoidanceGuidanceEnabled
              ? ((userSettings as any)?.scriptAvoidanceGuidance ?? '')
              : '',
          audioStyleGuidanceEnabled: isCharacterExperience
            ? false
            : !!(userSettings as any)?.audioStyleGuidanceEnabled,
          audioStyleGuidance:
            !isCharacterExperience && (userSettings as any)?.audioStyleGuidanceEnabled
              ? ((userSettings as any)?.audioStyleGuidance ?? '').slice(0, LIMITS.audioStyleGuidanceMax)
              : '',
          voiceId: selectedVoice?.externalId || null,
          voiceProvider: selectedVoice?.voiceProvider ?? null,
          projectExperience: normalizedProjectExperience,
          contentTone: normalizedContentTone,
        },
      },
    });

    return created;
  });

  // Return a list-item shape so the client can optimistically update the sidebar
  const trunc = (t: string) => (t.length > 30 ? t.slice(0, 27) + '...' : t);

  const finalOwnerName = ownerName;
  const finalOwnerEmail = ownerEmail;
  const finalOwnerPreferredLanguage = ownerPreferredLanguage;
  const projectEmailsEnabled = (userSettings as any)?.projectEmailsEnabled ?? true;
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
    console.error('Failed to notify admins about new project', err);
  });

  if (creationAttemptId) {
    try {
      await linkProjectCreationAttemptToProject({
        userId,
        attemptId: creationAttemptId,
        projectId: project.id,
      });
    } catch (err) {
      console.error('Failed to link project creation attempt', { projectId: project.id, creationAttemptId, err });
    }
  }

  sendProjectCreatedEmail({
    userId,
    email: finalOwnerEmail,
    name: finalOwnerName,
    preferredLanguage: finalOwnerPreferredLanguage,
    projectId: project.id,
    projectTitle: project.title,
    projectEmailsEnabled,
  }).catch((err) => {
    console.error('Failed to send project created email', err);
  });

  return ok({
    id: project.id,
    title: trunc(project.title),
    status: project.status as ProjectStatus,
    createdAt: project.createdAt.toISOString(),
  } satisfies import('@/shared/types').ProjectListItemDTO);
}, 'Failed to create project');

type ImagePrankRequestSource = {
  role: ImagePrankSourceImageRole;
  path: string;
  url: string;
  label?: string;
  width?: number;
  height?: number;
};

type ImagePrankRequest = {
  mode: ImagePrankMode;
  catalogItemId?: string;
  model?: string;
  sourceImages: ImagePrankRequestSource[];
};

type ResolvedImagePrankPayload = {
  mode: ImagePrankMode;
  prompt: string;
  userPrompt: string;
  model: ImagePrankGenerationModel;
  sourceImages: ImagePrankSourceImageDTO[];
  catalogItem: {
    id: string;
    slug: string;
    title: string;
    categorySlug: string;
    categoryTitle: string;
    subcategorySlug: string | null;
    subcategoryTitle: string | null;
  } | null;
};

type ImageDimensions = {
  width: number;
  height: number;
};

const IMAGE_PRANK_SYSTEM_PROMPT = [
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

const IOS_IMAGE_GENERATION_SAFETY_PROMPT = [
  'Mobile safety instruction:',
  'This request came from the iOS app. Generate only age-appropriate, non-explicit, non-NSFW imagery.',
  'Do not create nudity, explicit sexual content, pornographic or erotic framing, fetish content, lingerie or underwear focus, or sexualized minors.',
  'Keep clothing, pose, camera framing, and context safe for a general mobile audience.',
].join('\n');

const IOS_IMAGE_GENERATION_NEGATIVE_PROMPT = [
  'nudity',
  'nude',
  'naked',
  'explicit sexual content',
  'porn',
  'pornography',
  'erotic',
  'fetish',
  'lingerie',
  'underwear focus',
  'sexualized minors',
].join(', ');

const IOS_BLOCKED_NSFW_PROMPT_PATTERNS = [
  /\bnud(e|ity)\b/i,
  /\bnaked\b/i,
  /\bporn(?:ographic|ography)?\b/i,
  /\bexplicit\s+sexual\b/i,
  /\bsexual\s+content\b/i,
  /\bsex\b/i,
  /\berotic\b/i,
  /\bfetish\b/i,
  /\bmasturbat\w*\b/i,
  /\borgasm\w*\b/i,
  /\bgenitals?\b/i,
  /\bpenis\b/i,
  /\bvagina\b/i,
  /\bblow\s*job\b/i,
  /\bhand\s*job\b/i,
  /\bcum(?:shot)?\b/i,
  /\bunderage\b/i,
  /\bminor\s+sexual\b/i,
] as const;

function shouldBlockNsfwForAuth(auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>>) {
  return auth.source === 'mobile';
}

function hasBlockedIosNsfwPrompt(prompt: string) {
  return IOS_BLOCKED_NSFW_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function buildImageGenerationPrompt(userPrompt: string, blockNsfw: boolean) {
  const trimmed = userPrompt.trim();
  return blockNsfw ? `${IOS_IMAGE_GENERATION_SAFETY_PROMPT}\n\nUser prompt:\n${trimmed}` : trimmed;
}

function buildImagePrankPrompt(userPrompt: string, blockNsfw: boolean) {
  const systemPrompt = blockNsfw
    ? `${IMAGE_PRANK_SYSTEM_PROMPT}\n${IOS_IMAGE_GENERATION_SAFETY_PROMPT}`
    : IMAGE_PRANK_SYSTEM_PROMPT;
  return `${systemPrompt}\n\nUser prompt:\n${userPrompt.trim()}`;
}

function localizedTitle(item: ImagePrankCatalogItemDTO): string {
  return item.title.en || item.title.ru || 'Image prank';
}

function localizedCategoryTitle(item: ImagePrankCatalogItemDTO): string {
  return item.categoryTitle.en || item.categoryTitle.ru || 'Catalog';
}

function localizedSubcategoryTitle(item: ImagePrankCatalogItemDTO): string | null {
  if (!item.subcategoryTitle) return null;
  return item.subcategoryTitle.en || item.subcategoryTitle.ru || null;
}

function normalizeUploadedImageSource(source: ImagePrankRequestSource): ImagePrankSourceImageDTO {
  const path = toStoredMediaPath(source.path);
  return {
    role: source.role,
    label: source.label?.trim() || (source.role === 'prank' ? 'Prank image' : 'Target image'),
    imagePath: path,
    imageUrl: normalizeMediaUrl(path),
    width: safePositiveInteger(source.width),
    height: safePositiveInteger(source.height),
  };
}

function safePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function orientedImageDimensions(metadata: Metadata): ImageDimensions | null {
  let width = safePositiveInteger(metadata.width);
  let height = safePositiveInteger(metadata.height);
  if (!width || !height) return null;

  const orientation = typeof metadata.orientation === 'number' ? metadata.orientation : null;
  if (orientation && orientation >= 5 && orientation <= 8) {
    [width, height] = [height, width];
  }

  return { width, height };
}

async function readStoredImageDimensions(mediaPath: string | null | undefined): Promise<ImageDimensions | null> {
  if (!mediaPath) return null;
  try {
    const storedPath = toStoredMediaPath(mediaPath);
    const root = path.resolve(mediaRoot());
    const filePath = path.resolve(root, storedPath);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;

    const metadata = await sharp(filePath).metadata();
    return orientedImageDimensions(metadata);
  } catch {
    return null;
  }
}

async function withSourceImageDimensions(source: ImagePrankSourceImageDTO): Promise<ImagePrankSourceImageDTO> {
  const dimensions = await readStoredImageDimensions(source.imagePath);
  return dimensions ? { ...source, ...dimensions } : source;
}

function imagePrankReferenceAspectRatio(payload: ResolvedImagePrankPayload): number | null {
  const source = payload.sourceImages.find((entry) => entry.role === 'target')
    ?? payload.sourceImages.find((entry) => entry.role === 'reference')
    ?? null;
  const width = safePositiveInteger(source?.width);
  const height = safePositiveInteger(source?.height);
  return width && height ? width / height : null;
}

async function resolveImagePrankPayload(input: {
  userPrompt: string;
  imagePrank: ImagePrankRequest;
  blockNsfw: boolean;
}): Promise<ResolvedImagePrankPayload> {
  const { imagePrank, userPrompt, blockNsfw } = input;
  const uploaded = imagePrank.sourceImages.map(normalizeUploadedImageSource);
  const findRole = (role: ImagePrankSourceImageRole) => uploaded.find((source) => source.role === role) ?? null;
  let catalogItem: ImagePrankCatalogItemDTO | null = null;
  let sourceImages: ImagePrankSourceImageDTO[] = [];

  if (imagePrank.mode === 'catalog') {
    if (!imagePrank.catalogItemId) {
      throw new Error('Catalog prank image is required');
    }
    catalogItem = await getPublicImagePrankItemById(imagePrank.catalogItemId);
    if (!catalogItem) {
      throw new Error('Catalog prank image is not available');
    }
    const target = findRole('target');
    if (!target) {
      throw new Error('Target image is required');
    }
    sourceImages = [
      {
        role: 'prank',
        label: localizedTitle(catalogItem),
        imagePath: catalogItem.imagePath,
        imageUrl: catalogItem.imageUrl,
        previewImagePath: catalogItem.previewImagePath,
        previewImageUrl: catalogItem.previewImageUrl,
      },
      {
        ...target,
        label: target.label || 'Target image',
      },
    ];
  } else if (imagePrank.mode === 'custom-two-image') {
    const prank = findRole('prank');
    const target = findRole('target');
    if (!prank || !target) {
      throw new Error('Two custom images are required');
    }
    sourceImages = [
      { ...prank, label: prank.label || 'Prank image' },
      { ...target, label: target.label || 'Target image' },
    ];
  } else {
    const target = findRole('target');
    if (!target || uploaded.length !== 1) {
      throw new Error('One custom image is required');
    }
    sourceImages = [{ ...target, label: target.label || 'Reference image' }];
  }

  sourceImages = await Promise.all(sourceImages.map(withSourceImageDimensions));

  return {
    mode: imagePrank.mode,
    prompt: buildImagePrankPrompt(userPrompt, blockNsfw),
    userPrompt,
    model: imagePrank.model
      ? normalizeSelectableImagePrankGenerationModel(imagePrank.model) ?? DEFAULT_IMAGE_PRANK_GENERATION_MODEL
      : DEFAULT_IMAGE_PRANK_GENERATION_MODEL,
    sourceImages,
    catalogItem: catalogItem
      ? {
          id: catalogItem.id,
          slug: catalogItem.slug,
          title: localizedTitle(catalogItem),
          categorySlug: catalogItem.categorySlug,
          categoryTitle: localizedCategoryTitle(catalogItem),
          subcategorySlug: catalogItem.subcategorySlug ?? null,
          subcategoryTitle: localizedSubcategoryTitle(catalogItem),
        }
      : null,
  };
}

async function createImageGenerationProject(params: {
  userId: string;
  auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>>;
  prompt: string;
  characterSelection?: unknown;
  characterSlug?: string;
  imagePrank?: ImagePrankRequest;
  creationAttemptId?: string;
}) {
  const prompt = params.prompt.trim();
  if (!prompt) {
    return error('VALIDATION_ERROR', 'Prompt cannot be empty', 400);
  }
  const blockNsfw = shouldBlockNsfwForAuth(params.auth);
  if (blockNsfw && hasBlockedIosNsfwPrompt(prompt)) {
    return error(
      'VALIDATION_ERROR',
      'This prompt cannot be generated from the iOS app.',
      400,
    );
  }
  const generationPrompt = buildImageGenerationPrompt(prompt, blockNsfw);

  const normalizedCharacterSlug =
    typeof params.characterSlug === 'string' && params.characterSlug.trim().length > 0
      ? params.characterSlug.trim().toLowerCase()
      : null;
  if (normalizedCharacterSlug && params.characterSelection) {
    return error('VALIDATION_ERROR', 'Use either character selection or character slug, not both', 400);
  }
  const snapshotCharacterSelection = (params.characterSelection as any)?.source === 'snapshot'
    ? {
        source: 'snapshot',
        imageUrl: (params.characterSelection as any).imageUrl ?? null,
        imagePath: (params.characterSelection as any).imagePath ?? null,
        label: (params.characterSelection as any).label ?? null,
      }
    : null;
  if (snapshotCharacterSelection && params.auth.source !== 'admin-api') {
    return error('VALIDATION_ERROR', 'Snapshot character selection is only available to the admin API', 400);
  }

  let resolvedImagePrank: ResolvedImagePrankPayload | null = null;
  if (params.imagePrank) {
    try {
      resolvedImagePrank = await resolveImagePrankPayload({
        userPrompt: prompt,
        imagePrank: params.imagePrank,
        blockNsfw,
      });
    } catch (err) {
      return error('VALIDATION_ERROR', err instanceof Error ? err.message : 'Image prank payload is invalid', 400);
    }
  }

  const imagePrankDimensions = resolvedImagePrank
    ? imagePrankGenerationDimensionsForAspect(
        resolvedImagePrank.model,
        imagePrankReferenceAspectRatio(resolvedImagePrank),
      )
    : null;
  if (resolvedImagePrank && imagePrankDimensions) {
    const sizeValidationError = getImagePrankGenerationSizeValidationError(
      resolvedImagePrank.model,
      imagePrankDimensions,
    );
    if (sizeValidationError) {
      return error('VALIDATION_ERROR', sizeValidationError, 400);
    }
  }
  const imageSpec = {
    provider: 'runware',
    model: resolvedImagePrank ? resolvedImagePrank.model : 'runware:108@1',
    width: imagePrankDimensions?.width ?? DEFAULT_IMAGE_GENERATION_WIDTH,
    height: imagePrankDimensions?.height ?? DEFAULT_IMAGE_GENERATION_HEIGHT,
    estimatedDurationSeconds: 300,
    checkNSFW: blockNsfw,
    ...(blockNsfw ? { safetyNegativePrompt: IOS_IMAGE_GENERATION_NEGATIVE_PROMPT } : {}),
  };
  const tokenCost = TOKEN_COSTS.actions.imageGeneration;
  const now = new Date();
  const title = resolvedImagePrank
    ? `Image Prank: ${deriveTitleFromText(prompt, 18)}`
    : deriveTitleFromText(prompt, 20);
  let normalizedSelection: Awaited<ReturnType<typeof resolveImageProjectCharacterSelection>> | typeof snapshotCharacterSelection;
  if (resolvedImagePrank) {
    normalizedSelection = null;
  } else if (snapshotCharacterSelection) {
    normalizedSelection = snapshotCharacterSelection;
  } else {
    try {
      normalizedSelection = await resolveImageProjectCharacterSelection({
        userId: params.userId,
        characterSlug: normalizedCharacterSlug,
        characterSelection: params.characterSelection,
      });
    } catch (err) {
      return error('VALIDATION_ERROR', err instanceof Error ? err.message : 'Character selection is not available', 400);
    }
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        user: { connect: { id: params.userId } },
        title,
        prompt,
        rawScript: null,
        status: ProjectStatus.ProcessImagesGeneration,
      },
    });

    await spendTokens({
      userId: params.userId,
      amount: tokenCost,
      type: TOKEN_TRANSACTION_TYPES.imageGeneration,
      description: resolvedImagePrank ? 'Image Prank generation' : 'Image generation',
      initiator: makeUserInitiator(params.userId),
      metadata: {
        projectId: created.id,
        prompt,
        provider: imageSpec.provider,
        model: imageSpec.model,
        width: imageSpec.width,
        height: imageSpec.height,
        checkNSFW: imageSpec.checkNSFW,
        ...(imageSpec.safetyNegativePrompt ? { safetyNegativePrompt: imageSpec.safetyNegativePrompt } : {}),
        ...(resolvedImagePrank
          ? {
              imageKind: 'image-prank',
              imagePrankMode: resolvedImagePrank.mode,
              catalogItemId: resolvedImagePrank.catalogItem?.id ?? null,
            }
          : {}),
      },
    }, tx);

    if (normalizedSelection && !('source' in normalizedSelection)) {
      await tx.projectCharacterSelection.create({
        data: {
          projectId: created.id,
          characterId: normalizedSelection.characterId ?? null,
          userCharacterId: normalizedSelection.userCharacterId ?? null,
          characterVariationId: normalizedSelection.characterId ? normalizedSelection.variationId ?? null : null,
          userCharacterVariationId: normalizedSelection.userCharacterId ? normalizedSelection.variationId ?? null : null,
        },
      });
    }

    await tx.projectStatusHistory.create({
      data: {
        projectId: created.id,
        status: ProjectStatus.ProcessImagesGeneration,
        message: 'Image generation queued',
        extra: {
          projectExperience: 'image-generation',
          ...(resolvedImagePrank
            ? {
                imageKind: 'image-prank',
                imagePrank: {
                  mode: resolvedImagePrank.mode,
                  model: resolvedImagePrank.model,
                  sourceImages: resolvedImagePrank.sourceImages,
                  catalogItem: resolvedImagePrank.catalogItem,
                  userPrompt: resolvedImagePrank.userPrompt,
                },
              }
            : {}),
          progressStartedAt: now.toISOString(),
          ...imageSpec,
        } as any,
      },
    });

    await tx.job.create({
      data: {
        userId: params.userId,
        projectId: created.id,
        type: 'images',
        status: 'queued',
        payload: {
          projectExperience: 'image-generation',
          prompt: resolvedImagePrank?.prompt ?? generationPrompt,
          userPrompt: resolvedImagePrank?.userPrompt ?? prompt,
          ...(resolvedImagePrank
            ? {
                imageKind: 'image-prank',
                imagePrank: {
                  mode: resolvedImagePrank.mode,
                  model: resolvedImagePrank.model,
                  sourceImages: resolvedImagePrank.sourceImages,
                  catalogItem: resolvedImagePrank.catalogItem,
                },
              }
            : {}),
          ...imageSpec,
          characterSelection: normalizedSelection ?? null,
          initiatorUserId: params.userId,
        } as any,
      },
    });

    return created;
  });

  if (params.creationAttemptId) {
    try {
      await linkProjectCreationAttemptToProject({
        userId: params.userId,
        attemptId: params.creationAttemptId,
        projectId: project.id,
      });
    } catch (err) {
      console.error('Failed to link image project creation attempt', { projectId: project.id, creationAttemptId: params.creationAttemptId, err });
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      name: true,
      email: true,
      preferredLanguage: true,
      settings: {
        select: { projectEmailsEnabled: true },
      },
    },
  });
  const ownerName = params.auth.sessionUser?.name ?? dbUser?.name ?? null;
  const ownerEmail = params.auth.sessionUser?.email ?? dbUser?.email ?? null;
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
    userId: params.userId,
    userEmail: ownerEmail,
    userName: ownerName,
    projectUrl,
  }).catch((err) => {
    console.error('Failed to notify admins about new image project', err);
  });

  sendProjectCreatedEmail({
    userId: params.userId,
    email: ownerEmail,
    name: ownerName,
    preferredLanguage: dbUser?.preferredLanguage,
    projectId: project.id,
    projectTitle: project.title,
    projectEmailsEnabled: dbUser?.settings?.projectEmailsEnabled ?? true,
  }).catch((err) => {
    console.error('Failed to send project created email', err);
  });

  const trunc = (t: string) => (t.length > 30 ? t.slice(0, 27) + '...' : t);
  return ok({
    id: project.id,
    title: trunc(project.title),
    status: project.status as ProjectStatus,
    createdAt: project.createdAt.toISOString(),
  } satisfies import('@/shared/types').ProjectListItemDTO);
}

async function resolveImageProjectCharacterSelection(params: {
  userId: string;
  characterSlug: string | null;
  characterSelection?: unknown;
}): Promise<{ characterId?: string; userCharacterId?: string; variationId?: string } | null> {
  if (params.characterSlug) {
    const catalogCharacter = await prisma.character.findFirst({
      where: {
        slug: params.characterSlug,
        isCatalogPublic: true,
      },
      select: {
        id: true,
        variations: {
          orderBy: [{ priority: 'desc' }, { id: 'asc' }],
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!catalogCharacter) {
      throw new Error('Character is not available');
    }
    return {
      characterId: catalogCharacter.id,
      ...(catalogCharacter.variations[0]?.id ? { variationId: catalogCharacter.variations[0].id } : {}),
    };
  }

  const selection = params.characterSelection as {
    source?: unknown;
    characterId?: unknown;
    userCharacterId?: unknown;
    variationId?: unknown;
  } | null | undefined;
  if (!selection || selection.source === 'dynamic') return null;

  const characterId = typeof selection.characterId === 'string' ? selection.characterId : undefined;
  const userCharacterId = typeof selection.userCharacterId === 'string' ? selection.userCharacterId : undefined;
  const variationId = typeof selection.variationId === 'string' ? selection.variationId : undefined;
  if (!characterId && !userCharacterId) return null;

  if (characterId) {
    const variation = variationId
      ? await prisma.characterVariation.findFirst({
          where: {
            id: variationId,
            characterId,
            character: { isCatalogPublic: true },
          },
          select: { id: true },
        })
      : await prisma.characterVariation.findFirst({
          where: { characterId, character: { isCatalogPublic: true } },
          orderBy: [{ priority: 'desc' }, { id: 'asc' }],
          select: { id: true },
        });
    if (!variation) {
      throw new Error('Character variation not available');
    }
    return { characterId, variationId: variation.id };
  }

  if (!variationId) {
    throw new Error('Character variation is required');
  }
  if (!userCharacterId) {
    return null;
  }
  const variation = await prisma.userCharacterVariation.findFirst({
    where: {
      id: variationId,
      userCharacterId,
      deleted: false,
      userCharacter: { userId: params.userId, deleted: false },
    },
    select: { id: true },
  });
  if (!variation) {
    throw new Error('Character variation not available');
  }
  return { userCharacterId, variationId: variation.id };
}

function buildCharacterVideoGeneration(params: {
  mode: CharacterVideoGenerationMode;
  lipsyncPrompt?: string | null;
}) {
  if (params.mode === 'lipsync_runware') {
    const defaultConfig = defaultCharacterVideoGeneration();
    return {
      mode: params.mode,
      lipsyncPrompt: params.lipsyncPrompt?.trim() || defaultConfig.lipsyncPrompt,
    };
  }
  return {
    mode: params.mode,
  };
}
