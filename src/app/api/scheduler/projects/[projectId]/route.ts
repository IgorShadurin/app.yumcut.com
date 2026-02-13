import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden, notFound, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { prisma } from '@/server/db';
import { ensureSchedulerPreferences } from '@/server/publishing/preferences';
import { computeNextPublishAt } from '@/server/publishing/schedule';
import { createPublishTask } from '@/server/publishing/tasks';
import { listPublishChannels } from '@/server/publishing/channels';
import { normalizeMediaUrl } from '@/server/storage';
import { LANGUAGE_ENUM, LANGUAGES, type TargetLanguageCode } from '@/shared/constants/languages';
import { getCadenceDays } from '@/shared/constants/publish-scheduler';

const scheduleSchema = z.object({
  languages: z
    .array(
      z.object({
        languageCode: LANGUAGE_ENUM,
        channelId: z.string().uuid().optional(),
        title: z.string().max(255).optional(),
        description: z.string().max(2000).optional(),
      }),
    )
    .optional(),
});

function extractVideoUrl(asset: { publicUrl: string | null; path: string | null }, fallback: string | null) {
  if (asset.publicUrl) return asset.publicUrl;
  if (asset.path) return normalizeMediaUrl(asset.path) ?? fallback;
  return fallback;
}

type ScheduleOverride = {
  channelId: string | null;
  title: string | null;
  description: string | null;
};

function formatDefaultTitle(publishAt: Date) {
  const iso = publishAt.toISOString();
  return iso.replace('T', ' ').replace('Z', ' UTC');
}

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }
  const { projectId } = await params;

  const json = await req.json().catch(() => ({}));
  const parsed = scheduleSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid scheduler payload', 400, parsed.error.flatten());
  }
  const overrides = new Map<TargetLanguageCode, ScheduleOverride>(
    (parsed.data.languages ?? []).map((entry) => [
      entry.languageCode as TargetLanguageCode,
      {
        channelId: entry.channelId ?? null,
        title: entry.title?.trim() ? entry.title.trim() : null,
        description: entry.description?.trim() ? entry.description.trim() : null,
      },
    ]),
  );
  const supportedCodes = new Set<TargetLanguageCode>(LANGUAGES.map((lang) => lang.code));

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deleted: false },
    select: {
      id: true,
      finalVideoUrl: true,
      finalVideoPath: true,
      videos: {
        where: { isFinal: true },
        select: {
          languageCode: true,
          publicUrl: true,
          path: true,
        },
      },
      user: {
        select: {
          settings: {
            select: {
              schedulerDefaultTimes: true,
              schedulerCadence: true,
            },
          },
        },
      },
    },
  });
  if (!project) return notFound('Project not found');

  const prefs = ensureSchedulerPreferences(project.user?.settings?.schedulerDefaultTimes, project.user?.settings?.schedulerCadence);
  const channels = await listPublishChannels(userId);
  if (channels.length === 0) {
    return error('NO_CHANNELS', 'Connect a channel before scheduling uploads.', 400);
  }

  const assignments = new Map<string, { channelId: string; provider: string }[]>();
  channels.forEach((channel) => {
    channel.assignments.forEach((assignment) => {
      const key = assignment.languageCode.toLowerCase();
      const list = assignments.get(key) ?? [];
      list.push({ channelId: channel.id, provider: channel.provider });
      assignments.set(key, list);
    });
  });

  const fallbackUrl = project.finalVideoUrl ?? normalizeMediaUrl(project.finalVideoPath) ?? null;
  const createdTasks: Array<{ id: string; languageCode: string; publishAt: string; channelId: string; title: string | null; description: string | null }> = [];

  for (const asset of project.videos ?? []) {
    const rawCode = (asset.languageCode || '').toLowerCase();
    if (!supportedCodes.has(rawCode as TargetLanguageCode)) continue;
    const languageCode = rawCode as TargetLanguageCode;
    const videoUrl = extractVideoUrl(asset, fallbackUrl);
    if (!videoUrl) continue;
    const override = overrides.get(languageCode) ?? null;
    const assigned = assignments.get(languageCode) ?? [];
    const selectedChannelId = override?.channelId || assigned[0]?.channelId || null;
    if (!selectedChannelId) continue;
    const channelMeta = channels.find((channel) => channel.id === selectedChannelId);
    if (!channelMeta) continue;

    const baseTime = prefs.times[languageCode];
    const cadenceDays = getCadenceDays(prefs.cadence[languageCode]);
    const publishAt = await computeNextPublishAt({
      userId,
      channelId: selectedChannelId,
      languageCode,
      baseTime,
      cadenceDays,
    });

    const task = await createPublishTask({
      userId,
      projectId,
      languageCode,
      channelId: selectedChannelId,
      platform: channelMeta.provider,
      videoUrl,
      publishAt,
      title: override?.title || formatDefaultTitle(publishAt),
      description: override?.description || null,
      payload: null,
    });
    createdTasks.push({
      id: task.id,
      languageCode,
      publishAt: task.publishAt.toISOString(),
      channelId: selectedChannelId,
      title: task.title,
      description: task.description,
    });
  }

  return ok({
    scheduled: createdTasks.length,
    tasks: createdTasks,
  });
}, 'Failed to schedule project');
