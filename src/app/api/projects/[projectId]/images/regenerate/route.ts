import { z } from 'zod';
import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { LIMITS } from '@/server/limits';
import { grantTokens, spendTokens, TOKEN_TRANSACTION_TYPES, makeUserInitiator } from '@/server/tokens';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { config } from '@/server/config';
import { parseImageSize, getImageSizeValidationError } from '@/shared/image-generation/size';
import { requestRunwareImage, QWEN_DEFAULT_NEGATIVE_PROMPT } from '@/server/image-generation/runware';
import { resolveImageProvider } from '@/shared/constants/image-generation';
import { normalizeTemplateCustomData } from '@/shared/templates/custom-data';
import { getAdminImageEditorSettings } from '@/server/admin/image-editor';
import { ProjectStatus } from '@/shared/constants/status';

type Params = { projectId: string };

const regenerateSchema = z.object({
  templateImageId: z.string().min(1),
  prompt: z.string().trim().min(1).max(LIMITS.imagePromptMax),
  provider: z.string().min(1).default('runware'),
  model: z.string().optional(),
});

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = regenerateSchema.safeParse(json || {});
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }
  const { templateImageId, prompt, provider, model } = parsed.data;

  const adminSettings = await getAdminImageEditorSettings();
  if (!adminSettings.enabled) {
    return forbidden('Image editor is disabled');
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
    return error('VALIDATION_ERROR', 'Image regeneration is only available for custom templates', 400);
  }
  if (project.status !== ProjectStatus.Done) {
    return error('VALIDATION_ERROR', 'Image regeneration is available only for completed projects', 400);
  }

  const templateImage = await prisma.projectTemplateImage.findFirst({
    where: { id: templateImageId, projectId: project.id },
    include: { imageAsset: true },
  });
  if (!templateImage) return notFound('Template image not found');

  const size = parseImageSize(templateImage.size ?? null);
  if (!size) {
    return error('VALIDATION_ERROR', 'Template image size is missing or invalid', 400);
  }
  const sizeError = getImageSizeValidationError(size, {
    minTotalPixels: LIMITS.imageMinPixels,
    maxTotalPixels: LIMITS.imageMaxPixels,
    sizeMultiple: LIMITS.imageSizeMultiple,
  });
  if (sizeError) {
    return error('VALIDATION_ERROR', sizeError, 400);
  }

  const providerInfo = resolveImageProvider(provider);
  if (!providerInfo) {
    return error('VALIDATION_ERROR', 'Unsupported image provider', 400);
  }
  if (providerInfo.id !== 'runware') {
    return error('VALIDATION_ERROR', 'Only Runware is supported for now', 400);
  }

  const apiKey = (config.RUNWARE_IMAGE_EDITOR_API_KEY || '').trim();
  if (!apiKey) {
    return error('CONFIG_MISSING', 'Runware API key is not configured', 500);
  }

  const resolvedModel = (model && model.trim()) || templateImage.model || 'runware:108@1';
  const cost = TOKEN_COSTS.actions.imageRegeneration;
  let charged = false;
  if (cost > 0) {
    await spendTokens({
      userId,
      amount: cost,
      type: TOKEN_TRANSACTION_TYPES.imageRegeneration,
      description: 'Image regeneration',
      initiator: makeUserInitiator(userId),
      metadata: { projectId: project.id, templateImageId },
    });
    charged = true;
  }

  let result: { imageBytes: Uint8Array };
  try {
    result = await requestRunwareImage({
      apiKey,
      prompt,
      width: size.width,
      height: size.height,
      model: resolvedModel,
      negativePrompt: QWEN_DEFAULT_NEGATIVE_PROMPT,
    });
  } catch (err) {
    if (charged) {
      await grantTokens({
        userId,
        amount: cost,
        type: TOKEN_TRANSACTION_TYPES.imageRegenerationRefund,
        description: 'Image regeneration failed',
        initiator: makeUserInitiator(userId),
        metadata: { projectId: project.id, templateImageId },
      });
    }
    throw err;
  }

  const imageBase64 = Buffer.from(result.imageBytes).toString('base64');
  return ok({
    templateImageId,
    provider: providerInfo.id,
    model: resolvedModel,
    width: size.width,
    height: size.height,
    format: 'jpg',
    imageBase64,
  });
}, 'Failed to regenerate image');
