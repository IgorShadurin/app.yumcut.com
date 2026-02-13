import { z } from 'zod';
import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { LIMITS } from '@/server/limits';
import { verifySignedUploadGrant, assertUploadGrantFresh } from '@/lib/upload-signature';
import { normalizeTemplateCustomData } from '@/shared/templates/custom-data';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';
import { ProjectStatus } from '@/shared/constants/status';
import { deleteStoredMedia, normalizeMediaUrl, toStoredMediaPath } from '@/server/storage';

type Params = { projectId: string };

const replaceSchema = z.object({
  templateImageId: z.string().min(1),
  data: z.string().min(1),
  signature: z.string().min(1),
  path: z.string().min(1),
  url: z.string().min(1),
  prompt: z.string().trim().min(1).max(LIMITS.imagePromptMax).optional(),
  model: z.string().trim().min(1).max(128).optional(),
});

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = replaceSchema.safeParse(json || {});
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }
  const { templateImageId, data, signature, path, url, prompt, model } = parsed.data;

  const adminSettings = await getAdminImageEditorSettings();
  if (!adminSettings.enabled) {
    return forbidden('Image editor is disabled');
  }

  let uploadPayload;
  try {
    uploadPayload = verifySignedUploadGrant(data, signature);
    assertUploadGrantFresh(uploadPayload);
  } catch (err: any) {
    return forbidden(err?.message || 'Invalid upload authorization');
  }
  if (uploadPayload.userId !== userId) {
    return forbidden('Upload authorization belongs to another user');
  }
  if (uploadPayload.purpose !== 'user-character-image') {
    return error('VALIDATION_ERROR', 'Upload authorization purpose mismatch', 400);
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deleted: false },
    include: { template: true },
  });
  if (!project) return notFound('Project not found');

  const templateCustomData = project.template
    ? normalizeTemplateCustomData((project.template as any).customData ?? null)
    : null;
  if (!templateCustomData || templateCustomData.type !== 'custom') {
    return error('VALIDATION_ERROR', 'Image replacement is only available for custom templates', 400);
  }
  if (project.status !== ProjectStatus.Done) {
    return error('VALIDATION_ERROR', 'Image replacement is available only for completed projects', 400);
  }

  const templateImage = await prisma.projectTemplateImage.findFirst({
    where: { id: templateImageId, projectId: project.id },
    include: { imageAsset: true },
  });
  if (!templateImage) return notFound('Template image not found');

  const normalizedPath = toStoredMediaPath(path);
  const lower = normalizedPath.toLowerCase();
  if (!lower.startsWith('characters/') && !lower.startsWith('image/')) {
    return error('VALIDATION_ERROR', 'Upload path must live under characters/ or image/', 400);
  }
  // Always derive the public URL from the stored path to avoid trusting client-provided URLs.
  const finalUrl = normalizeMediaUrl(normalizedPath) ?? normalizedPath;

  const updatePayload = await prisma.$transaction(async (tx) => {
    const newAsset = await tx.imageAsset.create({
      data: {
        projectId: project.id,
        path: normalizedPath,
        publicUrl: finalUrl,
      },
    });
    const updateData: Record<string, unknown> = { imageAssetId: newAsset.id };
    if (prompt) updateData.prompt = prompt;
    if (model) updateData.model = model;
    await tx.projectTemplateImage.update({
      where: { id: templateImage.id },
      data: updateData,
    });
    return {
      imageAssetId: newAsset.id,
      imagePath: newAsset.path,
      imageUrl: newAsset.publicUrl,
      previousAssetId: templateImage.imageAssetId,
      previousPath: templateImage.imageAsset?.path ?? null,
    };
  });

  if (updatePayload.previousPath) {
    try {
      await deleteStoredMedia([updatePayload.previousPath], { userId });
      await prisma.imageAsset.delete({ where: { id: updatePayload.previousAssetId } }).catch(() => undefined);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to delete previous template image', err);
      }
    }
  }

  return ok({
    templateImageId,
    imageAssetId: updatePayload.imageAssetId,
    imagePath: updatePayload.imagePath,
    imageUrl: updatePayload.imageUrl,
  });
}, 'Failed to replace template image');
