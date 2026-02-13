import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { serviceAssetSchema } from '@/server/validators/service';
import { assertServiceAuth } from '@/server/auth';
import { ProjectStatus } from '@/shared/constants/status';
import { toStoredMediaPath, recordStoragePublicUrlHint } from '@/server/storage';
import { notifyProjectStatusChange } from '@/server/telegram';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  if (!assertServiceAuth(req)) return forbidden('Invalid service credentials');
  const { projectId } = await params;
  const json = await req.json();
  const parsed = serviceAssetSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');

  const { type, path, isFinal } = parsed.data;
  const storedPath = toStoredMediaPath(path);
  recordStoragePublicUrlHint(path);

  if (type === 'audio') {
    await prisma.audioCandidate.create({ data: { projectId: project.id, path: storedPath, publicUrl: path } });
  } else if (type === 'image') {
    await prisma.imageAsset.create({ data: { projectId: project.id, path: storedPath, publicUrl: path } });
  } else if (type === 'video') {
    await prisma.videoAsset.create({ data: { projectId: project.id, path: storedPath, publicUrl: path, isFinal: !!isFinal } });
    if (isFinal) {
      await prisma.$transaction([
        prisma.project.update({
          where: { id: project.id },
          data: { status: ProjectStatus.Done, finalVideoPath: storedPath, finalVideoUrl: path },
        }),
        prisma.projectStatusHistory.create({ data: { projectId: project.id, status: ProjectStatus.Done } }),
      ]);
      try {
        await notifyProjectStatusChange(project.id, ProjectStatus.Done);
      } catch (err) {
        console.error('Failed to send Telegram notification', err);
      }
    }
  }

  return ok({ ok: true });
}, 'Failed to attach asset');
