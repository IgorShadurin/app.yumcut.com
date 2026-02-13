import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, error as apiError } from '@/server/http';
import { requireAdminApiSession } from '@/server/admin';
import { getAdminNotificationSettings, updateAdminNotificationSettings } from '@/server/admin/notifications';

const updateSchema = z
  .object({
    notifyNewUser: z.boolean().optional(),
    notifyNewProject: z.boolean().optional(),
    notifyProjectDone: z.boolean().optional(),
    notifyProjectError: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => typeof value === 'boolean'), {
    message: 'No changes provided',
  });

export const GET = withApiError(async function GET() {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const settings = await getAdminNotificationSettings();
  return ok(settings satisfies import('@/shared/types').AdminNotificationSettingsDTO);
}, 'Failed to load admin notification settings');

export const PATCH = withApiError(async function PATCH(req: Request) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json || {});
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.issues?.[0]?.message || 'Invalid payload', 400, parsed.error.flatten());
  }
  const updated = await updateAdminNotificationSettings(parsed.data);
  return ok(updated satisfies import('@/shared/types').AdminNotificationSettingsDTO);
}, 'Failed to update admin notification settings');
