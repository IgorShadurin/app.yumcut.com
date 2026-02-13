import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { createPublishChannel } from '@/server/publishing/channels';

const connectSchema = z.object({
  provider: z.literal('youtube'),
  channelId: z.string().trim().min(1).max(128),
  displayName: z.string().trim().max(255).optional(),
  handle: z.string().trim().max(255).optional(),
  refreshToken: z.string().trim().max(4096).optional(),
  accessToken: z.string().trim().max(2048).optional(),
  scopes: z.string().trim().max(512).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }

  const json = await req.json().catch(() => null);
  const parsed = connectSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid channel payload', 400, parsed.error.flatten());
  }

  const channel = await createPublishChannel(userId, {
    provider: parsed.data.provider,
    channelId: parsed.data.channelId,
    displayName: parsed.data.displayName,
    handle: parsed.data.handle,
    refreshToken: parsed.data.refreshToken,
    accessToken: parsed.data.accessToken,
    scopes: parsed.data.scopes,
    metadata: parsed.data.metadata ?? null,
  });

  return ok({ channel });
}, 'Failed to connect channel');
