import { prisma } from '@/server/db';
import type { Prisma } from '@prisma/client';
import { decryptToken } from '@/server/crypto/publish-tokens';

export const PUBLISH_TASK_CANCEL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS = 5 * 60 * 60 * 1000; // 5 hours

const CLAIMABLE_STATUSES = ['pending', 'retry'];
const CLEANUP_PENDING_STATUS = 'cleanup_pending';
const CLEANUP_PROCESSING_STATUS = 'cleanup_processing';
type PublishTaskWithChannel = Prisma.PublishTaskGetPayload<{ include: { channel: true } }> & { providerTaskId?: string | null };

export async function createPublishTask(data: {
  userId: string;
  projectId: string;
  languageCode: string;
  channelId: string;
  platform: string;
  videoUrl: string;
  publishAt: Date;
  title?: string | null;
  description?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  return prisma.publishTask.create({
    data: {
      userId: data.userId,
      projectId: data.projectId,
      languageCode: data.languageCode,
      channelId: data.channelId,
      platform: data.platform,
      videoUrl: data.videoUrl,
      publishAt: data.publishAt,
      title: data.title ?? null,
      description: data.description ?? null,
      status: 'pending',
      payload: (data.payload ?? undefined) as any,
    },
  });
}

export function isPublishTaskEditable(task: { createdAt: Date; publishAt: Date }, now = new Date()) {
  const ageMs = now.getTime() - task.createdAt.getTime();
  const untilPublishMs = task.publishAt.getTime() - now.getTime();
  return ageMs < PUBLISH_TASK_CANCEL_WINDOW_MS && untilPublishMs >= PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS;
}

function buildReadyWindow(now: Date) {
  return {
    OR: [
      { createdAt: { lte: new Date(now.getTime() - PUBLISH_TASK_CANCEL_WINDOW_MS) } },
      { publishAt: { lte: new Date(now.getTime() + PUBLISH_TASK_MIN_PUBLISH_BUFFER_MS) } },
    ],
  };
}

export async function claimPublishTasks(limit: number): Promise<PublishTaskWithChannel[]> {
  if (limit <= 0) return [];
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.publishTask.findMany({
      where: {
        status: { in: CLAIMABLE_STATUSES },
        ...buildReadyWindow(now),
      },
      orderBy: { publishAt: 'asc' },
      take: limit,
      include: {
        channel: true,
      },
    }) as PublishTaskWithChannel[];
    if (candidates.length === 0) return [];
    const ids = candidates.map((task) => task.id);
    await tx.publishTask.updateMany({
      where: { id: { in: ids }, status: { in: CLAIMABLE_STATUSES } },
      data: { status: 'processing', errorMessage: null },
    });
    return candidates.map((task) => ({
      ...(task as PublishTaskWithChannel),
      status: 'processing' as const,
      channel: {
        ...task.channel,
        refreshToken: decryptToken(task.channel.refreshToken),
        accessToken: decryptToken(task.channel.accessToken),
      },
    }));
  });
}

export async function markPublishTaskScheduled(taskId: string, payload?: { providerTaskId?: string | null; providerResponse?: Record<string, unknown> | null }) {
  const updateData: Prisma.PublishTaskUpdateInput = {
    status: 'scheduled',
    errorMessage: null,
    providerTaskId: payload?.providerTaskId ?? null,
    payload: payload ? (payload as any) : undefined,
  } as any;
  return prisma.publishTask.update({
    where: { id: taskId },
    data: updateData,
  });
}

export async function markPublishTaskCompleted(taskId: string) {
  return prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      errorMessage: null,
    },
  });
}

export async function markPublishTaskFailed(taskId: string, message: string, providerResponse?: Record<string, unknown> | null) {
  return prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: 'failed',
      errorMessage: message,
      ...(providerResponse ? { payload: providerResponse as any } : {}),
    },
  });
}

export async function markPublishTaskRetry(taskId: string, message?: string | null, providerResponse?: Record<string, unknown> | null) {
  return prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: 'retry',
      errorMessage: message ?? null,
      ...(providerResponse ? { payload: providerResponse as any } : {}),
    },
  });
}

export async function requestPublishTaskCleanup(taskId: string, message?: string | null) {
  return prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: CLEANUP_PENDING_STATUS,
      cleanupRequestedAt: new Date(),
      errorMessage: message ?? null,
    },
  });
}

export async function claimCleanupTasks(limit: number): Promise<PublishTaskWithChannel[]> {
  if (limit <= 0) return [];
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.publishTask.findMany({
      where: { status: CLEANUP_PENDING_STATUS },
      orderBy: { cleanupRequestedAt: 'asc' },
      take: limit,
      include: { channel: true },
    }) as PublishTaskWithChannel[];
    if (candidates.length === 0) return [];
    const ids = candidates.map((task) => task.id);
    await tx.publishTask.updateMany({
      where: { id: { in: ids }, status: CLEANUP_PENDING_STATUS },
      data: { status: CLEANUP_PROCESSING_STATUS },
    });
    return candidates.map((task) => ({
      ...(task as PublishTaskWithChannel),
      status: CLEANUP_PROCESSING_STATUS,
      channel: {
        ...task.channel,
        refreshToken: decryptToken(task.channel.refreshToken),
        accessToken: decryptToken(task.channel.accessToken),
      },
    }));
  });
}

export async function markPublishTaskCleanupDone(taskId: string) {
  return prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: 'cleanup_done',
      cleanupCompletedAt: new Date(),
      errorMessage: null,
    },
  });
}

export async function markPublishTaskCleanupFailed(taskId: string, message: string) {
  return prisma.publishTask.update({
    where: { id: taskId },
    data: {
      status: 'cleanup_failed',
      cleanupCompletedAt: new Date(),
      errorMessage: message,
    },
  });
}
