import path from 'path';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { daemonStatusUpdateSchema } from '@/server/validators/daemon';
import { ProjectStatus } from '@/shared/constants/status';
import { notifyProjectStatusChange } from '@/server/telegram';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { storeTemplateImageMetadata } from '@/server/projects/helpers';

type Params = { projectId: string };

type TemplateImageMetadataInput = {
  assetId: string;
  image: string;
  model: string;
  prompt: string;
  sentence?: string | null;
  size?: string | null;
  url: string;
  path: string;
};

type NormalizedTemplateImageMetadata = {
  assetId: string;
  imageName: string;
  model: string;
  prompt: string;
  sentence: string | null;
  size: string | null;
};

const templateImageMetadataSchema = z.array(z.object({
  assetId: z.string().min(1),
  image: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  sentence: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  url: z.string().min(1),
  path: z.string().min(1),
}));

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const json = await req.json();
  const parsed = daemonStatusUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }
  const { status, message, extra } = parsed.data;
  const shouldReleaseDaemon =
    status === ProjectStatus.Done ||
    status === ProjectStatus.Error ||
    status === ProjectStatus.Cancelled;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const normalizedLanguages = normalizeLanguageList((project as any)?.languages ?? (project as any)?.targetLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const templateImageMetadataRaw = (extra as any)?.templateImageMetadata;
  let normalizedTemplateImages: NormalizedTemplateImageMetadata[] | null = null;
  if (templateImageMetadataRaw !== undefined) {
    const parsedMetadata = templateImageMetadataSchema.safeParse(templateImageMetadataRaw);
    if (!parsedMetadata.success) {
      return error('VALIDATION_ERROR', 'Invalid template image metadata', 400, parsedMetadata.error.flatten());
    }
    try {
      normalizedTemplateImages = normalizeTemplateImageMetadata(parsedMetadata.data);
    } catch (err: any) {
      return error('VALIDATION_ERROR', err?.message || 'Invalid template image metadata', 400);
    }
    const assetIds = normalizedTemplateImages.map((entry) => entry.assetId);
    if (assetIds.length > 0) {
      const assets = await prisma.imageAsset.findMany({
        where: { id: { in: assetIds }, projectId },
        select: { id: true },
      });
      const found = new Set(assets.map((asset) => asset.id));
      const missing = assetIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        return error('VALIDATION_ERROR', 'Invalid template image metadata', 400, { missingAssetIds: missing });
      }
    }
  }
  await prisma.$transaction(async (tx) => {
    const primaryLanguage = normalizedLanguages[0] ?? DEFAULT_LANGUAGE;
    const finalVoiceovers = extra && typeof (extra as any).finalVoiceovers === 'object' && (extra as any).finalVoiceovers !== null
      ? (extra as any).finalVoiceovers as Record<string, string>
      : null;

    if (finalVoiceovers && Object.keys(finalVoiceovers).length > 0) {
      await tx.audioCandidate.updateMany({ where: { projectId }, data: { isFinal: false } });
      const ids = Object.values(finalVoiceovers);
      if (ids.length > 0) {
        await tx.audioCandidate.updateMany({ where: { id: { in: ids } }, data: { isFinal: true } });
      }
      const explicitPrimaryId = (extra as any).finalVoiceoverId as string | undefined;
      const fallbackPrimaryId = finalVoiceovers[primaryLanguage] ?? Object.values(finalVoiceovers)[0] ?? null;
      const finalId = explicitPrimaryId || fallbackPrimaryId;
      const cand = finalId ? await tx.audioCandidate.findUnique({ where: { id: finalId } }) : null;
      await tx.project.update({
        where: { id: projectId },
        data: {
          status,
          finalVoiceoverId: cand?.id ?? null,
          finalVoiceoverPath: cand?.path ?? null,
          finalVoiceoverUrl: cand?.publicUrl ?? null,
        } as any,
      });
    } else if (status === ProjectStatus.ProcessAudio) {
      const script = await tx.script.findUnique({ where: { projectId_languageCode: { projectId, languageCode: primaryLanguage } } });
      if (script) {
        await tx.project.update({ where: { id: projectId }, data: { status, finalScriptText: script.text } as any });
      } else {
        await tx.project.update({ where: { id: projectId }, data: { status } });
      }
    } else if (extra && ((extra as any).finalVoiceoverId || (extra as any).approvedAudioId)) {
      const finalId = ((extra as any).finalVoiceoverId as string) || ((extra as any).approvedAudioId as string);
      const cand = await tx.audioCandidate.findUnique({ where: { id: finalId } });
      await tx.project.update({
        where: { id: projectId },
        data: {
          status,
          finalVoiceoverId: finalId,
          finalVoiceoverPath: cand?.path || null,
          finalVoiceoverUrl: cand?.publicUrl || null,
        } as any,
      });
    } else {
      await tx.project.update({ where: { id: projectId }, data: { status } });
    }

    if (normalizedTemplateImages) {
      await storeTemplateImageMetadata(tx, projectId, normalizedTemplateImages);
    }

    await tx.projectStatusHistory.create({
      data: { projectId, status, message: message ?? undefined, extra: extra as any },
    });
    if (shouldReleaseDaemon) {
      await tx.project.update({
        where: { id: projectId, currentDaemonId: daemonId },
        data: { currentDaemonId: null, currentDaemonLockedAt: null },
      });
    }
  });

  try {
    const shouldNotify = shouldNotifyStatus(status, extra, normalizedLanguages);
    if (shouldNotify) {
      await notifyProjectStatusChange(projectId, status, { message: message ?? null, extra: extra ?? null });
    }
  } catch (err) {
    console.error('Failed to send Telegram notification', err);
  }

  return ok({ ok: true });
}, 'Failed to update project status');
function normalizeLanguageCodes(input: unknown): Set<string> {
  if (!input) return new Set();
  if (Array.isArray(input)) {
    return new Set(
      input
        .map((code) => (typeof code === 'string' ? code.trim().toLowerCase() : ''))
        .filter((code) => code.length > 0),
    );
  }
  if (typeof input === 'object') {
    return new Set(
      Object.keys(input as Record<string, unknown>).map((code) => code.trim().toLowerCase()),
    );
  }
  if (typeof input === 'string') {
    return new Set([input.trim().toLowerCase()]);
  }
  return new Set();
}

function hasAllLanguages(candidate: unknown, languages: string[]): boolean {
  const available = normalizeLanguageCodes(candidate);
  if (available.size === 0) return false;
  return languages.every((code) => available.has(code));
}

function shouldNotifyStatus(status: ProjectStatus, extra: unknown, languages: string[]): boolean {
  if (languages.length === 0) return true;
  const payload = extra as Record<string, unknown> | undefined;
  switch (status) {
    case ProjectStatus.ProcessScriptValidate: {
      const scripts = payload?.scriptLanguages ?? payload?.languages;
      return hasAllLanguages(scripts, languages);
    }
    case ProjectStatus.ProcessAudio: {
      const translated = payload?.translatedLanguages ?? payload?.audioLanguages ?? payload?.languages;
      return hasAllLanguages(translated, languages);
    }
    case ProjectStatus.ProcessAudioValidate: {
      return hasAllLanguages(payload?.audioLanguages, languages);
    }
    case ProjectStatus.ProcessTranscription: {
      const pending = Array.isArray((payload as any)?.pendingLanguages) ? (payload as any).pendingLanguages : [];
      if (pending.length > 0) return false;
      if (payload?.finalVoiceovers) {
        return hasAllLanguages(payload.finalVoiceovers, languages);
      }
      if (payload?.transcriptionLanguages) {
        return hasAllLanguages(payload.transcriptionLanguages, languages);
      }
      return false;
    }
    case ProjectStatus.ProcessVideoMain: {
      const pending = Array.isArray((payload as any)?.pendingLanguages) ? (payload as any).pendingLanguages : [];
      if (pending.length > 0) return false;
      const finalVideos = payload?.finalVideoPaths ?? payload?.finalVideoLanguages ?? payload?.completedLanguages;
      return hasAllLanguages(finalVideos, languages);
    }
    default:
      return true;
  }
}

function normalizeTemplateImageMetadata(entries: TemplateImageMetadataInput[]): NormalizedTemplateImageMetadata[] {
  const seenImages = new Set<string>();
  const seenAssets = new Set<string>();
  return entries.map((entry, index) => {
    const imageName = path.basename(entry.image || '').trim();
    if (!imageName) {
      throw new Error(`Template image metadata entry ${index} is missing an image name`);
    }
    if (seenImages.has(imageName)) {
      throw new Error(`Template image metadata has a duplicate image entry: ${imageName}`);
    }
    seenImages.add(imageName);
    if (seenAssets.has(entry.assetId)) {
      throw new Error(`Template image metadata reuses asset id ${entry.assetId}`);
    }
    seenAssets.add(entry.assetId);
    return {
      assetId: entry.assetId,
      imageName,
      model: entry.model,
      prompt: entry.prompt,
      sentence: normalizeOptional(entry.sentence),
      size: normalizeOptional(entry.size),
    };
  });
}

function normalizeOptional(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
