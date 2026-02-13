import { prisma } from '@/server/db';

const STATUS_HISTORY = ['pending', 'retry', 'processing', 'scheduled', 'completed'];
const STATUS_BLOCKING = ['pending', 'retry', 'processing', 'scheduled'];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function combineDateAndTime(day: Date, time: string) {
  const [hours, minutes] = time.split(':').map((value) => parseInt(value, 10) || 0);
  const combined = startOfUtcDay(day);
  combined.setUTCHours(hours, minutes, 0, 0);
  return combined;
}

export async function computeNextPublishAt(params: {
  userId: string;
  channelId: string;
  languageCode: string;
  baseTime: string;
  cadenceDays: number;
}) {
  const now = new Date();
  const lastTask = await prisma.publishTask.findFirst({
    where: {
      userId: params.userId,
      channelId: params.channelId,
      languageCode: params.languageCode,
      status: { in: STATUS_HISTORY },
    },
    orderBy: { publishAt: 'desc' },
  });

  let candidate: Date;
  if (lastTask) {
    candidate = combineDateAndTime(addUtcDays(startOfUtcDay(lastTask.publishAt), params.cadenceDays), params.baseTime);
  } else {
    candidate = combineDateAndTime(now, params.baseTime);
  }

  while (candidate <= now) {
    candidate = addUtcDays(candidate, params.cadenceDays);
  }

  while (true) {
    const conflict = await prisma.publishTask.findFirst({
      where: {
        channelId: params.channelId,
        publishAt: candidate,
        status: { in: STATUS_BLOCKING },
      },
    });
    if (!conflict) break;
    candidate = addUtcDays(candidate, params.cadenceDays);
  }

  return candidate;
}
