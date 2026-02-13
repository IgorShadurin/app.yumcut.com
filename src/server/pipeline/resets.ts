import type { PrismaClient } from '@prisma/client';
import { ProjectStatus } from '@/shared/constants/status';
import { downstreamStatuses } from '@/shared/pipeline/status-order';
import { jobTypeForStatus } from '@/shared/pipeline/job-types';

type ProgressField = 'transcriptionDone' | 'captionsDone' | 'videoPartsDone' | 'finalVideoDone';

const FULL_RESET_FIELDS: ProgressField[] = ['transcriptionDone', 'captionsDone', 'videoPartsDone', 'finalVideoDone'];

const PROGRESS_RESET_FIELDS: Partial<Record<ProjectStatus, ProgressField[]>> = {
  [ProjectStatus.New]: FULL_RESET_FIELDS,
  [ProjectStatus.ProcessScript]: FULL_RESET_FIELDS,
  [ProjectStatus.ProcessScriptValidate]: FULL_RESET_FIELDS,
  [ProjectStatus.ProcessAudio]: FULL_RESET_FIELDS,
  [ProjectStatus.ProcessAudioValidate]: FULL_RESET_FIELDS,
  [ProjectStatus.ProcessTranscription]: FULL_RESET_FIELDS,
  [ProjectStatus.ProcessMetadata]: ['captionsDone', 'videoPartsDone', 'finalVideoDone'],
  [ProjectStatus.ProcessCaptionsVideo]: ['captionsDone', 'videoPartsDone', 'finalVideoDone'],
  [ProjectStatus.ProcessImagesGeneration]: ['videoPartsDone', 'finalVideoDone'],
  [ProjectStatus.ProcessVideoPartsGeneration]: ['videoPartsDone', 'finalVideoDone'],
  [ProjectStatus.ProcessVideoMain]: ['finalVideoDone'],
};

export type ProgressResetPlan = {
  fields: ProgressField[];
  updateData: Partial<Record<ProgressField, boolean>>;
  clearFinalVideo: boolean;
};

export function buildProgressResetPlan(status: ProjectStatus): ProgressResetPlan {
  const configured = PROGRESS_RESET_FIELDS[status] ?? [];
  const fields = Array.from(new Set(configured));
  const updateData: Partial<Record<ProgressField, boolean>> = {};
  for (const field of fields) {
    updateData[field] = false;
  }
  return {
    fields,
    updateData,
    clearFinalVideo: fields.includes('finalVideoDone'),
  };
}

export async function resetStageJobs(prisma: PrismaClient, projectId: string, jobType: string) {
  const now = new Date();
  const staged = await prisma.job.findMany({
    where: { projectId, type: jobType },
    orderBy: { createdAt: 'desc' },
  });

  if (staged.length > 0) {
    await prisma.job.updateMany({
      where: { projectId, type: jobType, status: { in: ['queued', 'running'] } },
      data: { status: 'failed', updatedAt: now },
    });
  }

  const user = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { userId: true } });
  await prisma.job.create({
    data: {
      projectId,
      userId: user.userId,
      type: jobType,
      status: 'queued',
      payload: (staged[0]?.payload ?? {}) as any,
    },
  });

  return { message: ` Created fresh ${jobType} job${staged.length > 0 ? ' (previous queued/running entries marked failed).' : '.'}` };
}

export async function resetDownstreamJobs(prisma: PrismaClient, projectId: string, status: ProjectStatus) {
  const targets = downstreamStatuses(status);
  if (targets.length === 0) return { total: 0, types: [] as string[], considered: 0 };

  const types = targets
    .map((s) => jobTypeForStatus(s))
    .filter((type): type is string => !!type);
  if (types.length === 0) return { total: 0, types: [], considered: targets.length };

  const now = new Date();
  let total = 0;
  const touchedTypes: string[] = [];
  for (const type of types) {
    const res = await prisma.job.updateMany({
      where: { projectId, type, status: { in: ['queued', 'running'] } },
      data: { status: 'failed', updatedAt: now },
    });
    if (res.count > 0) {
      total += res.count;
      touchedTypes.push(type);
    }
  }
  return { total, types: touchedTypes, considered: targets.length };
}
