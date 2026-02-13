import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeMediaUrl } from '@/server/storage';
import { getLatestErrorLog } from '@/server/projects/errors';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { sortAudioCandidatesByCreatedAtDesc } from '@/server/projects/helpers';
import { withCharacterSelectionLabels } from '@/server/characters/selection';
import { sanitizeStatusInfoForUser } from '../shared/sanitize-status';
import { authenticateApiRequest } from '@/server/api-user';
import { normalizeLanguageVoiceMap } from '@/shared/voices/language-voice-map';
import { normalizeTemplateCustomData } from '@/shared/templates/custom-data';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';

type Params = { projectId: string };

export const GET = withApiError(async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;
  const { projectId } = await params;
  
    const p = await prisma.project.findFirst({
      where: { id: projectId, userId, deleted: false },
      include: {
        scripts: true,
        audios: true,
        videos: true,
        statusLog: { orderBy: { createdAt: 'desc' }, take: 1 },
        selection: true,
        template: true,
      },
    });
  if (!p) return notFound('Project not found');

    const [initialJob, templateImages, adminImageEditor] = await Promise.all([
      prisma.job.findFirst({
        where: { projectId: p.id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.projectTemplateImage.findMany({
        where: { projectId: p.id },
        include: { imageAsset: true },
        orderBy: { imageName: 'asc' },
      }),
      getAdminImageEditorSettings(),
    ]);

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
    const primaryScriptRecord = scripts?.find((s) => s.languageCode === primaryLanguage) ?? scripts?.[0] ?? null;

    const languageVariants = languages.map((languageCode, index) => {
      const isPrimary = index === 0;
      const scriptRecord = scripts?.find((s) => s.languageCode === languageCode) ?? null;
      const audioCandidates = sortAudioCandidatesByCreatedAtDesc(
        (audios ?? []).filter((a) => ((a.languageCode ?? primaryLanguage) === languageCode)),
      )
        .map((a) => ({
          id: a.id,
          path: a.publicUrl || normalizeMediaUrl(a.path),
          languageCode,
          url: a.publicUrl || normalizeMediaUrl(a.path),
          isFinal: (a as any).isFinal === true,
          createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt ?? null,
        }));
      let finalVoiceoverPath: string | null = null;
      let finalVoiceoverUrl: string | null = null;
      const finalCandidateRecord = (audios ?? []).find((a) => (a.languageCode ?? primaryLanguage) === languageCode && (a as any).isFinal);
      if (finalCandidateRecord) {
        finalVoiceoverPath = finalCandidateRecord.publicUrl || normalizeMediaUrl(finalCandidateRecord.path);
        finalVoiceoverUrl = finalCandidateRecord.publicUrl || null;
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
    const extra = (latestLog?.extra as any) || undefined;
    const baseStatusInfo: Record<string, unknown> = {
      ...(extra || {}),
    };

    let statusInfo: Record<string, unknown> | undefined;

    switch (status) {
      case ProjectStatus.ProcessScriptValidate:
        statusInfo = { ...baseStatusInfo, languageVariants };
        break;
      case ProjectStatus.ProcessAudioValidate:
        statusInfo = { ...baseStatusInfo, languageVariants };
        break;
      case ProjectStatus.Error: {
        const errorLog = await getLatestErrorLog(prisma, p.id);
        statusInfo = {
          message: errorLog?.message || latestLog?.message || 'Unknown error',
          ...(languageVariants.length ? { languageVariants } : {}),
        };
        break;
      }
      case ProjectStatus.Done: {
        const final = p.videos.find((v: any) => v.isFinal);
        const finalUrl = (final as any)?.publicUrl || (p as any).finalVideoUrl || normalizeMediaUrl(final?.path || (p as any).finalVideoPath || null);
        statusInfo = {
          url: finalUrl,
          ...(languageVariants.length ? { languageVariants } : {}),
        };
        break;
      }
      default: {
        statusInfo = languageVariants.length ? { ...baseStatusInfo, languageVariants } : extra;
        break;
      }
    }
    const sanitizedStatusInfo = sanitizeStatusInfoForUser(statusInfo);

    const templateCustomData = p.template
      ? normalizeTemplateCustomData((p.template as any).customData ?? null)
      : null;
    const templateImageMetadata = templateImages.map((entry) => {
      const asset = entry.imageAsset;
      const url = asset?.publicUrl || normalizeMediaUrl(asset?.path ?? null);
      return {
        id: entry.id,
        assetId: entry.imageAssetId,
        imageName: entry.imageName,
        imageUrl: url,
        imagePath: asset?.path ?? null,
        model: entry.model,
        prompt: entry.prompt,
        sentence: entry.sentence ?? null,
        size: entry.size ?? null,
      };
    });

    // Optionally enrich character selection titles
    let characterTitle: string | null = null;
    let variationTitle: string | null = null;
    let characterImageUrl: string | null = null;
    let selectionStatus: 'ready' | 'processing' | 'failed' | null = null;
  let autoGenerated = false;
  if (p.selection?.characterId) {
    const char = await prisma.character.findUnique({ where: { id: p.selection.characterId } });
    const varr = p.selection.characterVariationId ? await prisma.characterVariation.findUnique({ where: { id: p.selection.characterVariationId } }) : null;
    characterTitle = char?.title || null;
    variationTitle = varr?.title || null;
    if (varr?.imagePath) {
      characterImageUrl = varr.imagePath.startsWith('/') ? varr.imagePath : `/${varr.imagePath}`;
    }
    selectionStatus = 'ready';
  } else if (p.selection?.userCharacterId) {
    const char = await prisma.userCharacter.findFirst({ where: { id: p.selection.userCharacterId, deleted: false } });
    const varr = p.selection.userCharacterVariationId
      ? await prisma.userCharacterVariation.findFirst({
          where: { id: p.selection.userCharacterVariationId, deleted: false },
          select: { id: true, title: true, imagePath: true, imageUrl: true, status: true, source: true },
        })
      : null;
    characterTitle = char?.title || null;
    variationTitle = varr?.title || null;
    characterImageUrl = normalizeMediaUrl(varr?.imagePath ?? varr?.imageUrl ?? null);
    selectionStatus = (varr?.status as 'ready' | 'processing' | 'failed') ?? null;
    autoGenerated = (varr as any)?.source === 'daemon';
  }

    let characterSelectionPayload: any = null;
    if (p.selection?.userCharacterId) {
      characterSelectionPayload = {
        type: 'user',
        source: 'user',
        userCharacterId: p.selection.userCharacterId,
        variationId: p.selection.userCharacterVariationId,
        characterTitle,
        variationTitle,
        imageUrl: characterImageUrl,
        generated: autoGenerated,
        status: selectionStatus,
      };
    } else if (p.selection?.characterId) {
      characterSelectionPayload = {
        type: 'global',
        source: 'global',
        characterId: p.selection.characterId,
        variationId: p.selection.characterVariationId,
        characterTitle,
        variationTitle,
        imageUrl: characterImageUrl,
        status: 'ready' as const,
      };
    } else if ((initialJob?.payload as any)?.characterSelection) {
      characterSelectionPayload = {
        ...(initialJob?.payload as any).characterSelection,
      };
    }
    const creation: any = initialJob?.payload ? {
      durationSeconds: (initialJob.payload as any).durationSeconds ?? null,
      useExactTextAsScript: (initialJob.payload as any).useExactTextAsScript ?? null,
      includeDefaultMusic: (initialJob.payload as any).includeDefaultMusic ?? null,
      addOverlay: (initialJob.payload as any).addOverlay ?? null,
      includeCallToAction: (initialJob.payload as any).includeCallToAction ?? null,
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
      voiceId: (initialJob.payload as any).voiceId ?? (p as any).voiceId ?? null,
      voiceProvider: (initialJob.payload as any).voiceProvider ?? (p as any).voiceProvider ?? null,
      targetLanguage: primaryLanguage,
      languages,
      languageVoiceAssignments: normalizeLanguageVoiceMap(
        (initialJob.payload as any)?.languageVoices
        ?? (p as any)?.languageVoiceAssignments
        ?? null,
      ),
      characterSelection: characterSelectionPayload ? withCharacterSelectionLabels(characterSelectionPayload) : null,
    } : undefined;

    const trunc = (t: string) => (t.length > 30 ? t.slice(0, 27) + '...' : t);

    const anyP: any = p as any;
    const computedFinalScriptText = anyP.finalScriptText
      ?? (status !== ProjectStatus.ProcessScriptValidate ? (primaryScriptRecord?.text ?? null) : null);
    const finalist = p.videos.find((candidate: any) => candidate.isFinal);
    const computedFinalVideoPath =
      anyP.finalVideoUrl
      || (finalist as any)?.publicUrl
      || normalizeMediaUrl(anyP.finalVideoPath ?? finalist?.path ?? null);
    return ok({
      id: p.id,
      userId: p.userId,
      title: trunc(p.title),
      prompt: p.prompt,
      rawScript: p.rawScript,
      finalScriptText: computedFinalScriptText,
      finalVoiceoverPath:
        anyP.finalVoiceoverUrl
        || ((anyP.finalVoiceoverId
          ? (p.audios.find((a: any) => a.id === anyP.finalVoiceoverId)?.publicUrl || null)
          : null))
        || normalizeMediaUrl(
          anyP.finalVoiceoverPath
          ?? (anyP.finalVoiceoverId ? (p.audios.find((a: any) => a.id === anyP.finalVoiceoverId)?.path || null) : null),
        ),
      finalVideoPath: computedFinalVideoPath,
      finalVideoUrl: computedFinalVideoPath,
      status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      languages,
      languageVariants,
      statusInfo: sanitizedStatusInfo,
      imageEditorEnabled: adminImageEditor.enabled,
      templateImages: templateImageMetadata,
      creation,
      template: p.template ? {
        id: p.template.id,
        title: p.template.title,
        description: p.template.description,
        previewImageUrl: p.template.previewImageUrl,
        previewVideoUrl: p.template.previewVideoUrl,
        customData: templateCustomData,
      } : null,
    });
}, 'Failed to load project');

export async function PATCH() {
  // Reserved for future updates
  return ok({});
}

export const DELETE = withApiError(async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;
  const { projectId } = await params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId, deleted: false } });
  if (!project) return notFound('Project not found');

  await prisma.project.update({ where: { id: project.id }, data: { deleted: true, deletedAt: new Date() } });
  return ok({ ok: true });
}, 'Failed to delete project');
