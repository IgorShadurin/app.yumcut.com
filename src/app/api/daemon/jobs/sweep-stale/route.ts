import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { ok, forbidden, error } from '@/server/http';
import { z } from 'zod';

const SweepSchema = z.object({
  ttlMinutes: z.number().int().min(1).max(1440).default(15),
  limit: z.number().int().min(1).max(1000).default(200),
  dryRun: z.boolean().default(false),
  projectId: z.string().min(1).optional(),
  includeQueued: z.boolean().default(false),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  if (!(await assertDaemonAuth(req))) return forbidden('Invalid daemon credentials');
  const json = await req.json().catch(() => ({}));
  const parsed = SweepSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }
  const { ttlMinutes, limit, dryRun, projectId, includeQueued } = parsed.data;
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

  const where: any = { updatedAt: { lt: cutoff } };
  if (includeQueued) {
    where.status = { in: ['running', 'queued'] } as any;
  } else {
    where.status = 'running' as any;
  }
  if (projectId) where.projectId = projectId;

  const stale = await prisma.job.findMany({
    where,
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true, projectId: true, type: true, status: true, createdAt: true, updatedAt: true },
  });

  if (dryRun || stale.length === 0) {
    return ok({ cutoff: cutoff.toISOString(), count: stale.length, stale });
  }

  const ids = stale.map((j) => j.id);
  await prisma.job.updateMany({ where: { id: { in: ids } }, data: { status: 'failed' } });

  return ok({ cutoff: cutoff.toISOString(), updated: ids, count: ids.length });
}, 'Failed to sweep stale running jobs');
