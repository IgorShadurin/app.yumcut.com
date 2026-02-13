import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { requireAdminApiSession } from '@/server/admin';
import { adminProjectStatusSchema } from '@/server/validators/admin';
import { jobTypeForStatus } from '@/shared/pipeline/job-types';
import { buildProgressResetPlan, resetDownstreamJobs, resetStageJobs } from '@/server/pipeline/resets';

type Params = { projectId: string };

// Downstream computation and job reset helpers are imported to avoid duplication with the CLI.

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authError } = await requireAdminApiSession();
  if (authError) return authError;
  if (!session?.user || !(session.user as any).isAdmin) return forbidden('Admin access required');

  const { projectId } = await params;
  const json = await req.json();
  const parsed = adminProjectStatusSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');

  const { status, resetProgress, languagesToReset } = parsed.data;
  const hasExplicitLanguageSelection = Array.isArray(languagesToReset);
  const normalizedLanguages = hasExplicitLanguageSelection
    ? Array.from(new Set((languagesToReset ?? []).map((code) => code.trim().toLowerCase())))
    : [];
  const progressPlan = buildProgressResetPlan(status);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        status,
        ...(resetProgress && progressPlan.clearFinalVideo ? { finalVideoPath: null, finalVideoUrl: null } : {}),
      },
    });
    await tx.projectStatusHistory.create({
      data: { projectId: project.id, status, message: 'Updated via Admin UI' },
    });
    if (resetProgress) {
      const progressUpdate = {
        ...progressPlan.updateData,
        disabled: false,
        failedStep: null,
        failureReason: null,
      };
      if (!hasExplicitLanguageSelection) {
        await tx.projectLanguageProgress.updateMany({
          where: { projectId: project.id },
          data: progressUpdate,
        });
      } else if (normalizedLanguages.length > 0) {
        await Promise.all(
          normalizedLanguages.map((languageCode) =>
            tx.projectLanguageProgress.upsert({
              where: { projectId_languageCode: { projectId: project.id, languageCode } },
              update: progressUpdate,
              create: { projectId: project.id, languageCode, ...progressUpdate },
            }),
          ),
        );
      }
    }
    if (resetProgress && progressPlan.clearFinalVideo) {
      await tx.videoAsset.updateMany({
        where: { projectId: project.id },
        data: { isFinal: false },
      });
    }
  });

  const jobType = jobTypeForStatus(status);
  if (jobType) await resetStageJobs(prisma, project.id, jobType);
  await resetDownstreamJobs(prisma, project.id, status);

  return ok({ ok: true });
}, 'Failed to update project status');
