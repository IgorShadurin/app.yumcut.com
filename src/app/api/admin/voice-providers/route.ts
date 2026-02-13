import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, error as apiError } from '@/server/http';
import { requireAdminApiSession } from '@/server/admin';
import { getAdminVoiceProviderSettings, updateAdminVoiceProviderSettings } from '@/server/admin/voice-providers';
import { VOICE_PROVIDER_IDS } from '@/shared/constants/voice-providers';

const providerEnum = z.enum(VOICE_PROVIDER_IDS as [string, ...string[]]);

const updateSchema = z.object({
  enabledProviders: z.array(providerEnum),
});

export const GET = withApiError(async function GET() {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const settings = await getAdminVoiceProviderSettings();
  return ok(settings satisfies import('@/shared/types').AdminVoiceProviderSettingsDTO);
}, 'Failed to load voice provider settings');

export const PATCH = withApiError(async function PATCH(req: Request) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json || {});
  if (!parsed.success) {
    return apiError('VALIDATION_ERROR', parsed.error.issues?.[0]?.message || 'Invalid payload', 400, parsed.error.flatten());
  }
  const updated = await updateAdminVoiceProviderSettings(parsed.data);
  return ok(updated satisfies import('@/shared/types').AdminVoiceProviderSettingsDTO);
}, 'Failed to update voice provider settings');
