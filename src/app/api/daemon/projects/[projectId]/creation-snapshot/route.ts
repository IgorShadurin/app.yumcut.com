import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import path from 'path';
import { normalizeMediaUrl } from '@/server/storage';
import { config } from '@/server/config';
import { normalizeTemplateCustomData } from '@/shared/templates/custom-data';
import { normalizeLanguageVoiceMap, mergeLanguageVoicePreferences, selectVoiceForLanguage } from '@/shared/voices/language-voice-map';
import type { LanguageVoiceMap } from '@/shared/types';
import { getAdminVoiceProviderSettings } from '@/server/admin/voice-providers';
import { buildVoiceProviderSet, FALLBACK_VOICE_PROVIDER_IDS } from '@/shared/constants/voice-providers';

type Params = { projectId: string };

export const GET = withApiError(async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      userId: true,
      templateId: true,
      currentDaemonId: true,
      template: {
        include: {
          overlay: true,
          music: true,
          artStyle: true,
          captionsStyle: true,
          voice: true,
        },
      },
      voiceId: true,
      voiceProvider: true,
      languageVoiceAssignments: true,
      languageVoiceProviders: true,
    },
  });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }
  const adminVoiceProviders = await getAdminVoiceProviderSettings();
  const allowedProviders = buildVoiceProviderSet(adminVoiceProviders.enabledProviders);

  const job = await prisma.job.findFirst({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  const payload = (job?.payload as any) || {};
  const payloadLanguageVoices = normalizeLanguageVoiceMap(payload?.languageVoices ?? null);
  const projectLanguageVoices = normalizeLanguageVoiceMap((project as any)?.languageVoiceAssignments ?? null);
  const explicitLanguageVoices = mergeLanguageVoicePreferences(projectLanguageVoices, payloadLanguageVoices);
  const payloadLanguageVoiceProviders = normalizeLanguageVoiceMap(payload?.languageVoiceProviders ?? null);
  const projectLanguageVoiceProviders = normalizeLanguageVoiceMap((project as any)?.languageVoiceProviders ?? null);
  const mergedLanguageVoiceProviders = mergeLanguageVoicePreferences(projectLanguageVoiceProviders, payloadLanguageVoiceProviders);

  const selectionRecord = await prisma.projectCharacterSelection.findUnique({ where: { projectId } });
  let characterSelection: {
    type: 'global' | 'user' | null;
    characterId?: string | null;
    userCharacterId?: string | null;
    variationId?: string | null;
    imagePath?: string | null;
    absoluteImagePath?: string | null;
    imageUrl?: string | null;
  } | null = null;

  const templateImages = await prisma.projectTemplateImage.findMany({
    where: { projectId },
    orderBy: { imageName: 'asc' },
    include: { imageAsset: true },
  });
  const normalizedTemplateImages = templateImages.map((entry) => ({
    imageName: entry.imageName,
    path: entry.imageAsset?.path ?? null,
    url: normalizeMediaUrl(entry.imageAsset?.publicUrl ?? entry.imageAsset?.path ?? null),
  }));

  if (selectionRecord) {
    if (selectionRecord.characterVariationId) {
      const variation = await prisma.characterVariation.findUnique({ where: { id: selectionRecord.characterVariationId }, select: { id: true, characterId: true, imagePath: true } });
      if (variation) {
        const relative = variation.imagePath ? variation.imagePath.replace(/^\/+/, '') : null;
        const publicPath = relative
          ? relative.startsWith('public/')
            ? `/${relative.replace(/^public\//, '')}`
            : `/${relative}`
          : null;
        const absolute = publicPath
          ? path.resolve(process.cwd(), publicPath.startsWith('/') ? path.join('public', publicPath.slice(1)) : publicPath)
          : null;
        characterSelection = {
          type: 'global',
          characterId: variation.characterId,
          variationId: variation.id,
          imagePath: publicPath,
          imageUrl: toAbsoluteUrl(publicPath, config.NEXTAUTH_URL),
          absoluteImagePath: absolute,
        };
      }
    } else if (selectionRecord.userCharacterVariationId) {
      const variation = await prisma.userCharacterVariation.findFirst({
        where: { id: selectionRecord.userCharacterVariationId, deleted: false },
        select: { id: true, userCharacterId: true, imagePath: true, imageUrl: true },
      });
      const downloadUrl = toAbsoluteUrl(
        normalizeMediaUrl(variation?.imagePath ?? variation?.imageUrl ?? null),
        config.STORAGE_PUBLIC_URL ?? config.NEXTAUTH_URL
      );
      if (variation && (variation.imagePath || variation.imageUrl)) {
        characterSelection = {
          type: 'user',
          userCharacterId: variation.userCharacterId,
          variationId: variation.id,
          imagePath: variation.imagePath,
          imageUrl: downloadUrl,
          absoluteImagePath: null,
        };
      }
    }
  }

  // If no selection in DB yet but the initial job payload requested a dynamic character,
  // expose this intent to the daemon so it can generate a new character.
  if (!characterSelection && payload?.characterSelection?.source === 'dynamic') {
    characterSelection = {
      // Keep type null to avoid faking global/user; attach dynamic marker and status in extras
      type: null,
      characterId: null,
      userCharacterId: null,
      variationId: null,
      imagePath: null,
      absoluteImagePath: null,
      imageUrl: null,
      // @ts-ignore — allow extra field for the daemon to detect
      source: 'dynamic',
      // @ts-ignore — progress hint
      status: 'processing',
    } as any;
  }

  const scriptCreationEnabled = !!payload.scriptCreationGuidanceEnabled;
  const scriptAvoidanceEnabled = !!payload.scriptAvoidanceGuidanceEnabled;
  const scriptCreationGuidance = typeof payload.scriptCreationGuidance === 'string' ? payload.scriptCreationGuidance : '';
  const scriptAvoidanceGuidance = typeof payload.scriptAvoidanceGuidance === 'string' ? payload.scriptAvoidanceGuidance : '';
  const audioStyleEnabled = !!payload.audioStyleGuidanceEnabled;
  const audioStyleGuidance = typeof payload.audioStyleGuidance === 'string' ? payload.audioStyleGuidance : '';
  // Resolve voice id (global list)
  const voiceId = project.voiceId || (typeof payload.voiceId === 'string' ? payload.voiceId : null);
  const targetLanguage = typeof payload.targetLanguage === 'string' ? payload.targetLanguage : 'en';
  const languages = Array.isArray(payload.languages)
    ? payload.languages.filter((code: unknown): code is string => typeof code === 'string' && code.trim().length > 0)
    : [targetLanguage];

  const candidateVoiceExternalIds = new Set<string>();
  if (project.voiceId) candidateVoiceExternalIds.add(project.voiceId);
  if (typeof payload.voiceId === 'string') candidateVoiceExternalIds.add(payload.voiceId);
  for (const voiceExternalId of Object.values(explicitLanguageVoices)) {
    if (typeof voiceExternalId === 'string' && voiceExternalId.trim().length > 0) {
      candidateVoiceExternalIds.add(voiceExternalId);
    }
  }
  const candidateVoiceIds = Array.from(candidateVoiceExternalIds);
const voiceQueryWhere = candidateVoiceIds.length > 0
  ? {
      OR: [
          { isPublic: true },
          { externalId: { in: candidateVoiceIds } },
          { id: { in: candidateVoiceIds } },
        ],
      }
    : { isPublic: true };
  const availableVoices = await prisma.templateVoice.findMany({
    where: voiceQueryWhere,
    orderBy: [{ weight: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      externalId: true,
      languages: true,
      speed: true,
      gender: true,
      voiceProvider: true,
      isPublic: true,
      weight: true,
    },
  });

  const voiceAssignments = computeVoiceAssignments(
    languages.length > 0 ? languages : [targetLanguage],
    availableVoices,
    voiceId,
    explicitLanguageVoices,
    { allowedProviders },
  );
  const voiceProviders: Record<string, string> = {};
  const assignProvider = (voiceExternalId: string | null | undefined, provider: string | null | undefined) => {
    const normalizedId = typeof voiceExternalId === 'string' ? voiceExternalId.trim() : '';
    const normalizedProvider = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
    if (normalizedId && normalizedProvider) {
      voiceProviders[normalizedId] = normalizedProvider;
    }
  };
  for (const voice of availableVoices) {
    if (voice.externalId && voice.voiceProvider) {
      assignProvider(voice.externalId, voice.voiceProvider);
    }
  }
  assignProvider(project.voiceId, project.voiceProvider ?? null);
  assignProvider(typeof payload.voiceId === 'string' ? payload.voiceId : null, typeof payload.voiceProvider === 'string' ? payload.voiceProvider : null);
  for (const [languageCode, voiceExternalId] of Object.entries(explicitLanguageVoices)) {
    if (!voiceExternalId) continue;
    const provider = mergedLanguageVoiceProviders[languageCode as keyof typeof mergedLanguageVoiceProviders];
    assignProvider(voiceExternalId, provider ?? null);
  }

  return ok({
    userId: project.userId,
    autoApproveScript: !!payload.autoApproveScript,
    autoApproveAudio: !!payload.autoApproveAudio,
    includeDefaultMusic: typeof payload.includeDefaultMusic === 'boolean' ? payload.includeDefaultMusic : true,
    addOverlay: typeof payload.addOverlay === 'boolean' ? payload.addOverlay : true,
    includeCallToAction: typeof payload.includeCallToAction === 'boolean' ? payload.includeCallToAction : true,
    watermarkEnabled: typeof payload.watermarkEnabled === 'boolean' ? payload.watermarkEnabled : true,
    captionsEnabled: typeof payload.captionsEnabled === 'boolean' ? payload.captionsEnabled : true,
    useExactTextAsScript: !!payload.useExactTextAsScript,
    durationSeconds: typeof payload.durationSeconds === 'number' ? payload.durationSeconds : null,
    targetLanguage,
    languages,
    scriptCreationGuidanceEnabled: scriptCreationEnabled,
    scriptCreationGuidance: scriptCreationEnabled ? scriptCreationGuidance : '',
    scriptAvoidanceGuidanceEnabled: scriptAvoidanceEnabled,
    scriptAvoidanceGuidance: scriptAvoidanceEnabled ? scriptAvoidanceGuidance : '',
    audioStyleGuidanceEnabled: audioStyleEnabled,
    audioStyleGuidance: audioStyleEnabled ? audioStyleGuidance : '',
    voiceId: voiceId || null,
    voiceAssignments,
    voiceProviders,
    template: project.template
      ? {
          id: project.template.id,
          code: project.template.code,
          title: project.template.title,
          description: project.template.description,
          previewImageUrl: project.template.previewImageUrl,
          previewVideoUrl: project.template.previewVideoUrl,
          customData: normalizeTemplateCustomData(project.template.customData),
          overlay: project.template.overlay
            ? {
                id: project.template.overlay.id,
                title: project.template.overlay.title,
                url: project.template.overlay.url,
                description: project.template.overlay.description,
              }
            : null,
          music: project.template.music
            ? {
                id: project.template.music.id,
                title: project.template.music.title,
                url: project.template.music.url,
                description: project.template.music.description,
              }
            : null,
          captionsStyle: project.template.captionsStyle
            ? {
                id: project.template.captionsStyle.id,
                title: project.template.captionsStyle.title,
                description: project.template.captionsStyle.description,
                externalId: project.template.captionsStyle.externalId,
              }
            : null,
          artStyle: project.template.artStyle
            ? {
                id: project.template.artStyle.id,
                title: project.template.artStyle.title,
                description: project.template.artStyle.description,
                prompt: project.template.artStyle.prompt,
                referenceImageUrl: project.template.artStyle.referenceImageUrl,
              }
            : null,
        }
      : null,
    templateImages: normalizedTemplateImages,
    characterSelection,
  });
}, 'Failed to load project snapshot');

function toAbsoluteUrl(pathOrUrl: string | null, baseCandidate?: string | undefined | null): string | null {
  if (!pathOrUrl) return null;
  try {
    const url = new URL(pathOrUrl);
    return url.toString();
  } catch {}
  const base = baseCandidate?.trim() || config.NEXTAUTH_URL?.trim();
  if (!base) return pathOrUrl;
  try {
    return new URL(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`, base).toString();
  } catch {
    return pathOrUrl;
  }
}

type TemplateVoiceRecord = {
  id: string;
  title: string;
  description: string | null;
  externalId: string | null;
  languages: string | null;
  speed: string | null;
  gender: string | null;
  voiceProvider: string | null;
  isPublic: boolean;
  weight: number | null;
};
const FALLBACK_VOICE_PROVIDERS = new Set(FALLBACK_VOICE_PROVIDER_IDS);

type VoiceAssignmentEntry = {
  voiceId: string | null;
  templateVoiceId: string | null;
  title: string | null;
  speed: string | null;
  gender: string | null;
  voiceProvider: string | null;
  source: 'project' | 'fallback' | 'none';
};

type PreparedVoiceRecord = {
  templateVoiceId: string;
  externalId: string;
  title: string;
  speed: string | null;
  gender: string | null;
  voiceProvider: string | null;
  isPublic: boolean;
  isFallbackEligible: boolean;
  languageSet: Set<string>;
  weight: number;
  order: number;
};

function normalizeLanguageCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function parseVoiceLanguageSet(raw: string | null): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const entry of raw.split(',')) {
    const normalized = normalizeLanguageCode(entry?.replace(/_/g, '-'));
    if (!normalized) continue;
    const [lang] = normalized.split('-');
    if (lang) set.add(lang);
  }
  return set;
}

function prepareVoices(
  records: TemplateVoiceRecord[],
  allowedProviders?: ReadonlySet<string>
): PreparedVoiceRecord[] {
  const allowedFallbackProviders = allowedProviders ?? FALLBACK_VOICE_PROVIDERS;
  return records
    .map((record, index) => {
      const externalId = typeof record.externalId === 'string' ? record.externalId.trim() : '';
      if (!externalId) return null;
      const provider = (record.voiceProvider ?? '').toLowerCase();
      const isFallbackEligible = !!record.isPublic && allowedFallbackProviders.has(provider);
      const weight = typeof record.weight === 'number' ? record.weight : 0;
      return {
        templateVoiceId: record.id,
        externalId,
        title: record.title,
        speed: record.speed ?? null,
        gender: record.gender ?? null,
        voiceProvider: record.voiceProvider ?? null,
        isPublic: record.isPublic ?? false,
        isFallbackEligible,
        languageSet: parseVoiceLanguageSet(record.languages),
        weight,
        order: index,
      } satisfies PreparedVoiceRecord;
    })
    .filter((voice): voice is PreparedVoiceRecord => voice !== null);
}

function computeVoiceAssignments(
  languages: string[],
  rawVoices: TemplateVoiceRecord[],
  preferredVoiceId: string | null,
  explicitLanguageVoices: LanguageVoiceMap | null | undefined,
  options?: { allowedProviders?: ReadonlySet<string> },
): Record<string, VoiceAssignmentEntry> {
  const prepared = prepareVoices(rawVoices, options?.allowedProviders);
  const preparedByExternalId = new Map(prepared.map((voice) => [voice.externalId, voice]));
  const preferred = preferredVoiceId ? prepared.find((voice) => voice.externalId === preferredVoiceId) ?? null : null;
  const preferredEligible = preferred ?? null;
  const assignments: Record<string, VoiceAssignmentEntry> = {};
  const seen = new Set<string>();
  const normalizedExplicit = explicitLanguageVoices ?? {};

  for (const code of languages) {
    const normalized = normalizeLanguageCode(code);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    let selected: PreparedVoiceRecord | null = null;
    let source: VoiceAssignmentEntry['source'] = 'none';

    const baseLanguage = normalized.split('-')[0] || normalized;

    const explicitVoiceId = selectVoiceForLanguage(normalizedExplicit, baseLanguage as any);
    if (explicitVoiceId) {
      const explicitRecord = preparedByExternalId.get(explicitVoiceId) ?? null;
      if (explicitRecord && explicitRecord.languageSet.has(baseLanguage)) {
        selected = explicitRecord;
        source = 'project';
        assignments[normalized] = {
          voiceId: selected.externalId,
          templateVoiceId: selected.templateVoiceId,
          title: selected.title,
          speed: selected.speed,
          gender: selected.gender,
          voiceProvider: selected.voiceProvider,
          source,
        };
        continue;
      }
    }

    let selectedProvider: string | null = null;

    if (preferredEligible && preferredEligible.languageSet.has(baseLanguage)) {
      selected = preferredEligible;
      selectedProvider = preferredEligible.voiceProvider ?? null;
      source = 'project';
    } else {
      const candidates = prepared
        .filter((voice) => voice.isFallbackEligible && voice.languageSet.has(baseLanguage))
        .sort((a, b) => {
          if (a.weight !== b.weight) return b.weight - a.weight;
          const aSpeed = a.speed === 'fast' ? 0 : 1;
          const bSpeed = b.speed === 'fast' ? 0 : 1;
          if (aSpeed !== bSpeed) return aSpeed - bSpeed;
          if (a.order !== b.order) return a.order - b.order;
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        });
      selected = candidates[0] ?? null;
      if (selected) {
        selectedProvider = selected.voiceProvider ?? null;
        source = preferred && selected.externalId === preferred.externalId ? 'project' : 'fallback';
      }
    }

    assignments[normalized] = selected
      ? {
          voiceId: selected.externalId,
          templateVoiceId: selected.templateVoiceId,
          title: selected.title,
          speed: selected.speed,
          gender: selected.gender,
          voiceProvider: selectedProvider,
          source,
        }
      : {
          voiceId: null,
          templateVoiceId: null,
          title: null,
          speed: null,
          gender: null,
          voiceProvider: null,
          source,
        };
  }

  return assignments;
}
