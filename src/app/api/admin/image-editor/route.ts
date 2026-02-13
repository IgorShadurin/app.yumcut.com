import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, error as apiError } from '@/server/http';
import { requireAdminApiSession } from '@/server/admin';
import { getAdminImageEditorSettings, updateAdminImageEditorSettings } from '@/server/admin/image-editor';

const updateSchema = z.object({
  enabled: z.boolean(),
});

export const GET = withApiError(async function GET() {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const settings = await getAdminImageEditorSettings();
  return ok(settings satisfies import('@/shared/types').AdminImageEditorSettingsDTO);
}, 'Failed to load image editor settings');

export const PATCH = withApiError(async function PATCH(req: Request) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json || {});
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.issues?.[0]?.message || 'Invalid payload', 400, parsed.error.flatten());
  }
  const updated = await updateAdminImageEditorSettings(parsed.data);
  return ok(updated satisfies import('@/shared/types').AdminImageEditorSettingsDTO);
}, 'Failed to update image editor settings');
