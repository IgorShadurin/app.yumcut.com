import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, error as apiError } from '@/server/http';
import { requireAdminApiSession } from '@/server/admin';
import { getProjectCreationSettings, updateProjectCreationSettings, type ProjectCreationSettings } from '@/server/admin/project-creation';

const updateSchema = z.object({
  projectCreationEnabled: z.boolean(),
  projectCreationDisabledReason: z.string().trim().max(500).optional(),
}).refine(
  (data) => data.projectCreationEnabled || !!data.projectCreationDisabledReason?.trim(),
  {
    message: 'projectCreationDisabledReason is required when disabling project creation.',
    path: ['projectCreationDisabledReason'],
  },
);

function mapSettings(settings: ProjectCreationSettings): import('@/shared/types').AdminProjectCreationSettingsDTO {
  return {
    projectCreationEnabled: settings.enabled,
    projectCreationDisabledReason: settings.disabledReason,
  };
}

export const GET = withApiError(async function GET() {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const settings = await getProjectCreationSettings();
  return ok(mapSettings(settings) satisfies import('@/shared/types').AdminProjectCreationSettingsDTO);
}, 'Failed to load project creation settings');

export const PATCH = withApiError(async function PATCH(req: Request) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json || {});
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.issues?.[0]?.message || 'Invalid payload', 400, parsed.error.format());
  }
  const next = await updateProjectCreationSettings({
    enabled: parsed.data.projectCreationEnabled,
    disabledReason: parsed.data.projectCreationDisabledReason,
  });
  return ok(mapSettings(next) satisfies import('@/shared/types').AdminProjectCreationSettingsDTO);
}, 'Failed to update project creation settings');
