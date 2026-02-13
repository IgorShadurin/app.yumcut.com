import { z } from 'zod';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ensureGoogleUser, issueMobileSessionTokens, verifyGoogleIdToken } from '@/server/mobile-auth';

const BodySchema = z.object({
  idToken: z.string().min(20, 'idToken is required'),
  deviceId: z.string().min(3).max(191),
  deviceName: z.string().min(1).max(191).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
});

export const POST = withApiError(async function POST(req: Request) {
  const json = await req.json();
  const body = BodySchema.parse(json);

  const payload = await verifyGoogleIdToken(body.idToken);
  if (!payload.email) {
    return unauthorized('Google account is missing an email address.');
  }

  const user = await ensureGoogleUser(payload, body.idToken);
  const session = await issueMobileSessionTokens({
    userId: user.id,
    deviceId: body.deviceId,
    deviceName: body.deviceName,
    platform: body.platform,
    appVersion: body.appVersion,
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    tokens: session,
    provider: 'google',
    providerAccountId: payload.sub,
  });
}, 'Failed to sign in with Google');
