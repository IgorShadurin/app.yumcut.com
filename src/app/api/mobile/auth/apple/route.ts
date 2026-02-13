import { z } from 'zod';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ensureAppleUser, issueMobileSessionTokens, verifyAppleIdentityToken } from '@/server/mobile-auth';
import { config } from '@/server/config';

const BodySchema = z.object({
  identityToken: z.string().min(20, 'identityToken is required'),
  fullName: z.string().max(191).optional(),
  deviceId: z.string().min(3).max(191),
  deviceName: z.string().min(1).max(191).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
});

export const POST = withApiError(async function POST(req: Request) {
  const json = await req.json();
  const body = BodySchema.parse(json);

  const audiences = [config.APPLE_IOS_CLIENT_ID].filter(Boolean) as string[];
  const payload = await verifyAppleIdentityToken(body.identityToken, audiences.length ? audiences : undefined);
  if (!payload.email) {
    return unauthorized('Apple account is missing an email address.');
  }

  const user = await ensureAppleUser(payload, body.identityToken, body.fullName);
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
    provider: 'apple',
    providerAccountId: payload.sub,
  });
}, 'Failed to sign in with Apple');
