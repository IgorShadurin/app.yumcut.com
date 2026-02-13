import { z } from 'zod';
import { ok } from '@/server/http';
import { withApiError } from '@/server/errors';
import { getOrCreateGuestUser, issueMobileSessionTokens } from '@/server/mobile-auth';

const BodySchema = z.object({
  deviceId: z.string().min(3).max(191),
  deviceName: z.string().min(1).max(191).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
});

export const POST = withApiError(async function POST(req: Request) {
  const json = await req.json();
  const body = BodySchema.parse(json);

  const deviceId = body.deviceId.trim();
  if (!deviceId) {
    throw new Error('deviceId is required');
  }

  const deviceName = body.deviceName?.trim() || undefined;
  const platform = body.platform?.trim() || undefined;
  const appVersion = body.appVersion?.trim() || undefined;

  const guestUser = await getOrCreateGuestUser({
    deviceId,
    deviceName,
    platform,
    appVersion,
  });

  const session = await issueMobileSessionTokens({
    userId: guestUser.id,
    deviceId,
    deviceName,
    platform,
    appVersion,
  });

  return ok({
    user: {
      id: guestUser.id,
      email: guestUser.email,
      name: guestUser.name,
      image: guestUser.image,
    },
    tokens: session,
    provider: 'guest',
    providerAccountId: guestUser.id,
  });
}, 'Failed to sign in as guest');
