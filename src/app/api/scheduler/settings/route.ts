import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { prisma } from '@/server/db';
import { ensureSchedulerPreferences } from '@/server/publishing/preferences';
import { listPublishChannels, updateChannelLanguages } from '@/server/publishing/channels';
import { LANGUAGES, LANGUAGE_ENUM } from '@/shared/constants/languages';
import { SCHEDULER_CADENCE_OPTIONS, normalizeSchedulerTime, normalizeCadence } from '@/shared/constants/publish-scheduler';

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/);
const cadenceEnum = z.enum(SCHEDULER_CADENCE_OPTIONS.map((option) => option.value) as [string, ...string[]]);

const updateSchema = z.object({
  defaultTimes: z.record(LANGUAGE_ENUM, timeOfDaySchema).optional(),
  cadence: z.record(LANGUAGE_ENUM, cadenceEnum).optional(),
  channelLanguages: z
    .array(
      z.object({
        channelId: z.string().uuid(),
        languages: z.array(LANGUAGE_ENUM),
      }),
    )
    .optional(),
});

async function buildSchedulerState(userId: string) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const prefs = ensureSchedulerPreferences((settings as any)?.schedulerDefaultTimes, (settings as any)?.schedulerCadence);
  const channels = await listPublishChannels(userId);
  return {
    enabled: true,
    defaults: { times: prefs.times, cadence: prefs.cadence },
    cadenceOptions: SCHEDULER_CADENCE_OPTIONS,
    languages: LANGUAGES.map((lang) => ({ code: lang.code, label: lang.label })),
    channels: channels.map((channel) => ({
      id: channel.id,
      provider: channel.provider,
      channelId: channel.channelId,
      displayName: channel.displayName,
      handle: channel.handle,
      languages: channel.assignments.map((assignment) => assignment.languageCode),
      disconnectedAt: channel.disconnectedAt ? channel.disconnectedAt.toISOString() : null,
      createdAt: channel.createdAt.toISOString(),
    })),
  };
}

export const GET = withApiError(async function GET() {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return ok({ enabled: false });
  }
  const state = await buildSchedulerState(userId);
  return ok(state);
}, 'Failed to load scheduler settings');

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }

  const json = await req.json();
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid scheduler payload', 400, parsed.error.flatten());
  }
  const { defaultTimes, cadence, channelLanguages } = parsed.data;

  const currentSettings = await prisma.userSettings.findUnique({ where: { userId } });
  const mergedTimes = defaultTimes
    ? {
        ...(currentSettings?.schedulerDefaultTimes as Record<string, string> | undefined ?? {}),
        ...Object.fromEntries(Object.entries(defaultTimes).map(([code, value]) => [code, normalizeSchedulerTime(value)])),
      }
    : undefined;
  const mergedCadence = cadence
    ? {
        ...(currentSettings?.schedulerCadence as Record<string, string> | undefined ?? {}),
        ...Object.fromEntries(Object.entries(cadence).map(([code, value]) => [code, normalizeCadence(value)])),
      }
    : undefined;

  if (mergedTimes || mergedCadence) {
    await prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(mergedTimes ? { schedulerDefaultTimes: mergedTimes } : {}),
        ...(mergedCadence ? { schedulerCadence: mergedCadence } : {}),
      },
      create: {
        userId,
        schedulerDefaultTimes: mergedTimes ?? {},
        schedulerCadence: mergedCadence ?? {},
      },
    });
  }

  if (channelLanguages?.length) {
    for (const entry of channelLanguages) {
      await updateChannelLanguages(userId, entry.channelId, entry.languages);
    }
  }

  const state = await buildSchedulerState(userId);
  return ok(state);
}, 'Failed to update scheduler settings');
