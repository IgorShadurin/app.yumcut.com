import { prisma } from '@/server/db';

const STATUS_ORDER = ['pending', 'retry', 'processing', 'scheduled', 'failed'];

export async function getPublishTaskSnapshot(limit = 20) {
  const [tasks, grouped] = await Promise.all([
    prisma.publishTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        channel: true,
        project: { select: { id: true, title: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.publishTask.groupBy({
      by: ['status'],
      _count: true,
    }),
  ]);

  const counts: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  for (const entry of grouped) {
    counts[entry.status] = entry._count;
  }

  return {
    counts,
    tasks: tasks.map((task) => ({
      id: task.id,
      status: task.status,
      publishAt: task.publishAt.toISOString(),
      createdAt: task.createdAt.toISOString(),
      providerTaskId: (task as any).providerTaskId ?? null,
      channel: {
        id: task.channel.id,
        label: task.channel.displayName || task.channel.channelId,
        provider: task.channel.provider,
      },
      project: task.project ? { id: task.project.id, title: task.project.title } : null,
      user: task.user ? { id: task.user.id, email: task.user.email, name: task.user.name } : null,
      languageCode: task.languageCode,
      errorMessage: task.errorMessage ?? null,
    })),
  };
}
