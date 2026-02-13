import { z } from 'zod';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { refreshMobileSessionTokens } from '@/server/mobile-auth';
import { prisma } from '@/server/db';

const BodySchema = z.object({
  refreshToken: z.string().min(20),
  deviceId: z.string().max(191).optional(),
  deviceName: z.string().max(191).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
});

export const POST = withApiError(async function POST(req: Request) {
  const json = await req.json();
  const body = BodySchema.parse(json);

  const session = await refreshMobileSessionTokens({
    refreshToken: body.refreshToken,
    deviceId: body.deviceId,
    deviceName: body.deviceName,
    platform: body.platform,
    appVersion: body.appVersion,
  });

  if (!session) {
    return unauthorized('Invalid or expired refresh token.');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, image: true },
  });

  if (!user) {
    return unauthorized('User is no longer available.');
  }

  return ok({
    user,
    tokens: session,
  });
}, 'Failed to refresh mobile session');
