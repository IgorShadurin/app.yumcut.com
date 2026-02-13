import type { Prisma } from '@prisma/client';
import { ProjectStatus } from '@/shared/constants/status';

export async function getLatestErrorLog(tx: Prisma.TransactionClient | typeof import('@/server/db').prisma, projectId: string) {
  // Fetch most recent error-specific log to avoid mixing with non-error updates.
  const errorLog = await (tx as any).projectStatusHistory.findFirst({
    where: { projectId, status: ProjectStatus.Error },
    orderBy: { createdAt: 'desc' },
    select: { message: true, extra: true, createdAt: true },
  });
  return errorLog || null;
}

