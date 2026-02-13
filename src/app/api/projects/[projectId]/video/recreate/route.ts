import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { normalizeTemplateCustomData } from '@/shared/templates/custom-data';
import { deleteStoredMedia } from '@/server/storage';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deleted: false },
    include: {
      template: true,
      videos: true,
    },
  });
  if (!project) return notFound('Project not found');
  if (project.status !== ProjectStatus.Done) {
    return error('VALIDATION_ERROR', 'Project must be completed before re-creating video', 400);
  }

  const templateCustomData = project.template
    ? normalizeTemplateCustomData((project.template as any).customData ?? null)
    : null;
  if (!templateCustomData || templateCustomData.type !== 'custom') {
    return error('VALIDATION_ERROR', 'Video re-create is only available for custom templates', 400);
  }

  const languages = normalizeLanguageList((project as any).languages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const existingVideoPaths = project.videos.map((video) => video.path).filter(Boolean);

  const lastJob = await prisma.job.findFirst({
    where: { projectId, daemonId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { daemonId: true },
  });
  const preferredDaemonId = lastJob?.daemonId ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.videoAsset.deleteMany({ where: { projectId } });
    await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.ProcessVideoPartsGeneration,
        finalVideoPath: null,
        finalVideoUrl: null,
        currentDaemonId: preferredDaemonId,
        currentDaemonLockedAt: preferredDaemonId ? new Date() : null,
      },
    });

    for (const languageCode of languages) {
      await tx.projectLanguageProgress.upsert({
        where: { projectId_languageCode: { projectId, languageCode } },
        update: {
          videoPartsDone: false,
          finalVideoDone: false,
        },
        create: {
          projectId,
          languageCode,
          transcriptionDone: true,
          captionsDone: true,
          videoPartsDone: false,
          finalVideoDone: false,
        },
      });
    }

    await tx.job.deleteMany({
      where: { projectId, type: { in: ['video_parts', 'video_main'] }, status: { in: ['queued', 'running'] } },
    });
    await tx.job.create({
      data: {
        projectId,
        userId,
        type: 'video_parts',
        status: 'queued',
        payload: {
          reason: 'video_recreate',
          recreateVideo: true,
          languages,
        },
      },
    });

    await tx.projectStatusHistory.create({
      data: {
        projectId,
        status: ProjectStatus.ProcessVideoPartsGeneration,
        message: 'User requested video re-create',
        extra: { reason: 'video_recreate' },
      },
    });
  });

  if (existingVideoPaths.length > 0) {
    try {
      await deleteStoredMedia(existingVideoPaths, { userId });
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to delete previous video assets during re-create', err);
      }
    }
  }

  return ok({ ok: true });
}, 'Failed to re-create video');
