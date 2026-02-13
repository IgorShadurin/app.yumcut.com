import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { LANGUAGE_ENUM } from '@/shared/constants/languages';
import { z } from 'zod';

type Params = { projectId: string };

const updateSchema = z.object({
  languageCode: LANGUAGE_ENUM,
  transcriptionDone: z.boolean().optional(),
  captionsDone: z.boolean().optional(),
  videoPartsDone: z.boolean().optional(),
  finalVideoDone: z.boolean().optional(),
  disabled: z.boolean().optional(),
  failedStep: z.string().trim().min(1).max(64).optional().nullable(),
  failureReason: z.string().trim().min(1).max(512).optional().nullable(),
});

function normalize(code: string): string {
  return code.trim().toLowerCase();
}

type ProgressRow = {
  languageCode: string;
  transcriptionDone: boolean;
  captionsDone: boolean;
  videoPartsDone: boolean;
  finalVideoDone: boolean;
  disabled: boolean;
};

function aggregate(progress: ProgressRow[]) {
  const active = progress.filter((row) => !row.disabled);
  const remaining = (field: keyof Pick<ProgressRow, 'transcriptionDone' | 'captionsDone' | 'videoPartsDone' | 'finalVideoDone'>) =>
    active.filter((row) => !row[field]).map((row) => row.languageCode);
  return {
    transcription: { done: active.length === 0 || active.every((row) => row.transcriptionDone), remaining: remaining('transcriptionDone') },
    captions: { done: active.length === 0 || active.every((row) => row.captionsDone), remaining: remaining('captionsDone') },
    videoParts: { done: active.length === 0 || active.every((row) => row.videoPartsDone), remaining: remaining('videoPartsDone') },
    finalVideo: { done: active.length === 0 || active.every((row) => row.finalVideoDone), remaining: remaining('finalVideoDone') },
  };
}

export const GET = withApiError(async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const progress = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
  const normalized = progress.map((row) => ({
    languageCode: row.languageCode,
    transcriptionDone: row.transcriptionDone,
    captionsDone: row.captionsDone,
    videoPartsDone: row.videoPartsDone,
    finalVideoDone: row.finalVideoDone,
    disabled: row.disabled,
    failedStep: row.failedStep,
    failureReason: row.failureReason,
  }));
  return ok({ progress: normalized, aggregate: aggregate(normalized) });
}, 'Failed to load language progress');

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }

  const data = parsed.data;
  const languageCode = normalize(data.languageCode);

  const apply: Record<string, unknown> = {
    ...(data.transcriptionDone !== undefined ? { transcriptionDone: data.transcriptionDone } : {}),
    ...(data.captionsDone !== undefined ? { captionsDone: data.captionsDone } : {}),
    ...(data.videoPartsDone !== undefined ? { videoPartsDone: data.videoPartsDone } : {}),
    ...(data.finalVideoDone !== undefined ? { finalVideoDone: data.finalVideoDone } : {}),
    ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
    ...(data.failedStep !== undefined ? { failedStep: data.failedStep ?? null } : {}),
    ...(data.failureReason !== undefined ? { failureReason: data.failureReason ?? null } : {}),
  };

  await prisma.projectLanguageProgress.upsert({
    where: { projectId_languageCode: { projectId, languageCode } },
    create: { projectId, languageCode, ...apply },
    update: apply,
  });

  const progress = await prisma.projectLanguageProgress.findMany({ where: { projectId } });
  const normalized = progress.map((row) => ({
    languageCode: row.languageCode,
    transcriptionDone: row.transcriptionDone,
    captionsDone: row.captionsDone,
    videoPartsDone: row.videoPartsDone,
    finalVideoDone: row.finalVideoDone,
    disabled: row.disabled,
    failedStep: row.failedStep,
    failureReason: row.failureReason,
  }));
  return ok({
    progress: normalized,
    aggregate: aggregate(normalized),
  });
}, 'Failed to update language progress');
