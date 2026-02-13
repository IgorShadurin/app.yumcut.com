import { prisma } from '@/server/db';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeMediaUrl } from '@/server/storage';
import { getLatestErrorLog } from '@/server/projects/errors';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { sortAudioCandidatesByCreatedAtDesc } from '@/server/projects/helpers';
import { normalizeLanguageVoiceMap } from '@/shared/voices/language-voice-map';

export interface ListProjectsOptions {
  page?: number;
  pageSize?: number;
}

export async function listProjects(options: ListProjectsOptions = {}) {
  const take = Math.min(Math.max(options.pageSize ?? 20, 1), 50);
  const page = Math.max(Math.floor(options.page ?? 1), 1);
  const skip = (page - 1) * take;

  const [items, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: { deleted: false },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true, name: true } },
        selection: { select: { characterId: true, userCharacterId: true } },
      },
    }),
    prisma.project.count({ where: { deleted: false } }),
  ]);

  // Detect dynamic choice for projects without a selection yet by looking at the earliest job payload
  const ids = items.map((p) => p.id);
  const jobsByProject = new Map<string, any>();
  for (const id of ids) {
    const j = await prisma.job.findFirst({ where: { projectId: id }, orderBy: { createdAt: 'asc' }, select: { payload: true } });
    jobsByProject.set(id, j?.payload || null);
  }

  return {
    items: items.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status as ProjectStatus,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      user: {
        id: p.user.id,
        email: p.user.email,
        name: p.user.name,
      },
      characterKind: p.selection?.userCharacterId ? 'user' : p.selection?.characterId ? 'global' : ((jobsByProject.get(p.id) as any)?.characterSelection?.source === 'dynamic' ? 'dynamic' : null),
    })),
    page,
    pageSize: take,
    total,
    totalPages: Math.max(Math.ceil(total / take), 1),
  };
}

export interface AdminProjectDetailResult {
  project: import('@/shared/types').ProjectDetailDTO;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  latestLogMessage: string | null;
  languageProgress: import('@/shared/types').ProjectLanguageProgressStateDTO[];
}

export async function getProjectDetailForAdmin(projectId: string): Promise<AdminProjectDetailResult | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      scripts: true,
      audios: true,
      videos: true,
      statusLog: { orderBy: { createdAt: 'desc' }, take: 1 },
      selection: true,
    },
  });
  if (!p || p.deleted) return null;

  const initialJob = await prisma.job.findFirst({
    where: { projectId: p.id },
    orderBy: { createdAt: 'asc' },
  });

  const languages = normalizeLanguageList(
    (p as any)?.languages
      ?? (initialJob?.payload as any)?.languages
      ?? (initialJob?.payload as any)?.targetLanguage
      ?? DEFAULT_LANGUAGE,
    DEFAULT_LANGUAGE,
  );
  const primaryLanguage = languages[0] ?? DEFAULT_LANGUAGE;
  const scripts = (p as any).scripts as Array<{ languageCode: string; text: string }> | undefined;
  const audios = (p as any).audios as Array<{
    id: string;
    path: string;
    publicUrl?: string | null;
    localPath?: string | null;
    languageCode?: string | null;
    isFinal?: boolean | null;
    createdAt?: Date | string | null;
  }> | undefined;
  const videos = (p as any).videos as Array<{ id: string; path: string; publicUrl?: string | null; isFinal?: boolean; languageCode?: string | null }> | undefined;
  const primaryScript = scripts?.find((s) => s.languageCode === primaryLanguage) ?? scripts?.[0] ?? null;

  const languageVariants = languages.map((languageCode, index) => {
    const isPrimary = index === 0;
    const scriptRecord = scripts?.find((s) => s.languageCode === languageCode) ?? null;
    const audioCandidates = sortAudioCandidatesByCreatedAtDesc(
      (audios ?? []).filter((a) => ((a.languageCode ?? primaryLanguage) === languageCode)),
    )
      .map((a) => ({
        id: a.id,
        path: a.publicUrl || normalizeMediaUrl(a.path) || a.path || '',
        languageCode,
        url: a.publicUrl || normalizeMediaUrl(a.path) || null,
        isFinal: (a as any).isFinal === true,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt ?? null,
      }));

    let finalVoiceoverPath: string | null = null;
    let finalVoiceoverUrl: string | null = null;
    const finalCandidate = (audios ?? []).find((a) => (a.languageCode ?? primaryLanguage) === languageCode && (a as any).isFinal);
    if (finalCandidate) {
      finalVoiceoverPath = finalCandidate.publicUrl || normalizeMediaUrl(finalCandidate.path);
      finalVoiceoverUrl = finalCandidate.publicUrl || null;
    } else if ((p as any).finalVoiceoverId) {
      const match = (audios ?? []).find((a) => a.id === (p as any).finalVoiceoverId && ((a.languageCode ?? primaryLanguage) === languageCode));
      if (match) {
        finalVoiceoverPath = match.publicUrl || normalizeMediaUrl(match.path);
        finalVoiceoverUrl = match.publicUrl || null;
      }
    }
    if (!finalVoiceoverPath && isPrimary) {
      finalVoiceoverPath = (p as any).finalVoiceoverUrl
        || normalizeMediaUrl((p as any).finalVoiceoverPath ?? null);
      finalVoiceoverUrl = (p as any).finalVoiceoverUrl ?? null;
    }

    const finalVideoRecord =
      (videos ?? []).find((v) => v.languageCode === languageCode && v.isFinal)
      ?? (isPrimary ? (videos ?? []).find((v) => v.isFinal && !v.languageCode) : undefined);
    const finalVideoPath = finalVideoRecord ? (finalVideoRecord.publicUrl || normalizeMediaUrl(finalVideoRecord.path)) : null;
    const finalVideoUrl = finalVideoRecord ? finalVideoRecord.publicUrl || null : null;

    return {
      languageCode,
      isPrimary,
      scriptText: scriptRecord?.text ?? null,
      audioCandidates,
      finalVoiceoverPath,
      finalVoiceoverUrl,
      finalVideoPath,
      finalVideoUrl,
    };
  });

  const status = p.status as ProjectStatus;
  const latestLog = p.statusLog[0];
  let statusInfo: Record<string, unknown> | undefined;

  switch (status) {
    case ProjectStatus.ProcessScriptValidate:
      statusInfo = {
        scriptText: primaryScript?.text || '',
        languageCode: primaryScript?.languageCode ?? primaryLanguage,
        ...(languageVariants.length ? { languageVariants } : {}),
      };
      break;
    case ProjectStatus.ProcessAudioValidate: {
      const sortedAdminAudios = sortAudioCandidatesByCreatedAtDesc(audios ?? []);
      statusInfo = {
        audioCandidates: sortedAdminAudios.map((a) => ({
          id: a.id,
          path: a.publicUrl || normalizeMediaUrl(a.path),
          languageCode: a.languageCode ?? primaryLanguage,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt ?? null,
        })),
        ...(languageVariants.length ? { languageVariants } : {}),
      };
      break;
    }
    case ProjectStatus.Error: {
      const errorLog = await getLatestErrorLog(prisma, p.id);
      statusInfo = { message: errorLog?.message || latestLog?.message || 'Unknown error' };
      break;
    }
    case ProjectStatus.Done: {
      const finalVariant = languageVariants.find((variant) => variant.isPrimary && variant.finalVideoUrl)
        ?? languageVariants.find((variant) => variant.finalVideoUrl)
        ?? null;
      const finalUrl = finalVariant?.finalVideoUrl
        || (p as any).finalVideoUrl
        || normalizeMediaUrl((p as any).finalVideoPath ?? null);
      statusInfo = {
        url: finalUrl,
        ...(languageVariants.length ? { languageVariants } : {}),
      };
      break;
    }
    default: {
      const extra = (latestLog?.extra as any) || undefined;
      statusInfo = languageVariants.length ? { ...(extra || {}), languageVariants } : extra;
      break;
    }
  }

  let characterTitle: string | null = null;
  let variationTitle: string | null = null;
  let characterImageUrl: string | null = null;
  let selectionStatus: 'ready' | 'processing' | 'failed' | null = null;
  let autoGenerated = false;
  if (p.selection?.characterId) {
    const char = await prisma.character.findUnique({ where: { id: p.selection.characterId } });
    const variation = p.selection.characterVariationId
      ? await prisma.characterVariation.findUnique({ where: { id: p.selection.characterVariationId } })
      : null;
    characterTitle = char?.title || null;
    variationTitle = variation?.title || null;
    if ((variation as any)?.imagePath) {
      characterImageUrl = (variation as any).imagePath.startsWith('/') ? (variation as any).imagePath : `/${(variation as any).imagePath}`;
    }
    selectionStatus = 'ready';
  } else if (p.selection?.userCharacterId) {
    const char = await prisma.userCharacter.findFirst({ where: { id: p.selection.userCharacterId, deleted: false } });
    const variation = p.selection.userCharacterVariationId
      ? await prisma.userCharacterVariation.findFirst({
          where: { id: p.selection.userCharacterVariationId, deleted: false },
          select: { id: true, title: true, imagePath: true, imageUrl: true, status: true, source: true },
        })
      : null;
    characterTitle = char?.title || null;
    variationTitle = variation?.title || null;
    characterImageUrl = normalizeMediaUrl((variation as any)?.imagePath ?? (variation as any)?.imageUrl ?? null);
    selectionStatus = ((variation as any)?.status as 'ready' | 'processing' | 'failed') ?? null;
    autoGenerated = ((variation as any)?.source === 'daemon');
  }

  const creation = initialJob?.payload ? {
    durationSeconds: (initialJob.payload as any).durationSeconds ?? null,
    useExactTextAsScript: (initialJob.payload as any).useExactTextAsScript ?? null,
    includeDefaultMusic: (initialJob.payload as any).includeDefaultMusic ?? null,
    addOverlay: (initialJob.payload as any).addOverlay ?? null,
    autoApproveScript: (initialJob.payload as any).autoApproveScript ?? null,
    autoApproveAudio: (initialJob.payload as any).autoApproveAudio ?? null,
    watermarkEnabled: (initialJob.payload as any).watermarkEnabled ?? null,
    captionsEnabled: (initialJob.payload as any).captionsEnabled ?? null,
    scriptCreationGuidanceEnabled: (initialJob.payload as any).scriptCreationGuidanceEnabled ?? null,
    scriptCreationGuidance: (initialJob.payload as any).scriptCreationGuidance ?? null,
    scriptAvoidanceGuidanceEnabled: (initialJob.payload as any).scriptAvoidanceGuidanceEnabled ?? null,
    scriptAvoidanceGuidance: (initialJob.payload as any).scriptAvoidanceGuidance ?? null,
    audioStyleGuidanceEnabled: (initialJob.payload as any).audioStyleGuidanceEnabled ?? null,
    audioStyleGuidance: (initialJob.payload as any).audioStyleGuidance ?? null,
    targetLanguage: primaryLanguage,
    languages,
    languageVoiceAssignments: normalizeLanguageVoiceMap(
      (initialJob.payload as any)?.languageVoices
      ?? (p as any)?.languageVoiceAssignments
      ?? null,
    ),
    characterSelection: p.selection
      ? p.selection.userCharacterId
        ? {
            type: 'user' as const,
            userCharacterId: p.selection.userCharacterId,
            variationId: p.selection.userCharacterVariationId,
            characterTitle,
            variationTitle,
            imageUrl: characterImageUrl,
            generated: autoGenerated,
            status: selectionStatus,
          }
        : p.selection.characterId
        ? {
            type: 'global' as const,
            characterId: p.selection.characterId,
            variationId: p.selection.characterVariationId,
            characterTitle,
            variationTitle,
            imageUrl: characterImageUrl,
            status: 'ready',
          }
        : null
      : (initialJob.payload as any).characterSelection ?? null,
  } : undefined;

  const anyProject = p as any;
  const finalScriptText = anyProject.finalScriptText
    ?? (status !== ProjectStatus.ProcessScriptValidate ? (primaryScript?.text ?? null) : null);

  const primaryVariant = languageVariants.find((variant) => variant.languageCode === primaryLanguage) ?? languageVariants[0] ?? null;
  const finalVideoUrl = primaryVariant?.finalVideoUrl
    ?? anyProject.finalVideoUrl
    ?? null;
  const finalVideoPath =
    primaryVariant?.finalVideoPath
    ?? normalizeMediaUrl(anyProject.finalVideoPath ?? null)
    ?? finalVideoUrl;
  const finalVoiceoverPath =
    primaryVariant?.finalVoiceoverPath
    ?? anyProject.finalVoiceoverUrl
    ?? normalizeMediaUrl(
      anyProject.finalVoiceoverPath
      ?? (anyProject.finalVoiceoverId
        ? (p.audios.find((a: any) => a.id === anyProject.finalVoiceoverId)?.path || null)
        : null),
    );

  const progressRows = await prisma.projectLanguageProgress.findMany({ where: { projectId: p.id } });
  const languageProgress = progressRows.map((row) => ({
    languageCode: row.languageCode,
    transcriptionDone: row.transcriptionDone,
    captionsDone: row.captionsDone,
    videoPartsDone: row.videoPartsDone,
    finalVideoDone: row.finalVideoDone,
    disabled: row.disabled,
    failedStep: row.failedStep,
    failureReason: row.failureReason,
  }));

  return {
    project: {
      id: p.id,
      userId: p.userId,
      title: p.title,
      prompt: p.prompt,
      rawScript: p.rawScript,
      finalScriptText,
      finalVoiceoverPath,
      finalVideoPath,
      finalVideoUrl,
      status,
      statusInfo,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      languages,
      languageVariants,
      creation,
      languageProgress,
    },
    user: {
      id: p.user.id,
      email: p.user.email,
      name: p.user.name,
    },
    latestLogMessage: (status === ProjectStatus.Error
      ? ((await getLatestErrorLog(prisma, p.id))?.message || latestLog?.message)
      : latestLog?.message) || null,
    languageProgress,
  };
}
