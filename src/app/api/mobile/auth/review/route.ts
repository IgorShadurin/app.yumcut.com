import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { config } from '@/server/config';
import { issueMobileSessionTokens } from '@/server/mobile-auth';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().min(3).max(191),
  deviceName: z.string().min(1).max(191).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
});

const REVIEW_EMAIL = config.REVIEW_LOGIN_EMAIL?.trim().toLowerCase();
const REVIEW_PASSWORD = config.REVIEW_LOGIN_PASSWORD;
const ALLOW_REVIEW_AUTH_BYPASS = process.env.ALLOW_NO_REVIEW_AUTH === '1' || process.env.CI === 'true';

if (!REVIEW_EMAIL || !REVIEW_PASSWORD) {
  if (!ALLOW_REVIEW_AUTH_BYPASS) {
    throw new Error('REVIEW_LOGIN_EMAIL and REVIEW_LOGIN_PASSWORD must be configured for reviewer auth.');
  }
}

const REVIEW_PASSWORD_HASH = REVIEW_PASSWORD
  ? createHash('sha256').update(REVIEW_PASSWORD).digest()
  : null;

function passwordsMatch(input: string): boolean {
  if (!REVIEW_PASSWORD_HASH) return false;
  const inputHash = createHash('sha256').update(input).digest();
  return timingSafeEqual(REVIEW_PASSWORD_HASH, inputHash);
}

export const POST = withApiError(async function POST(req: Request) {
  const json = await req.json();
  const body = BodySchema.parse(json);

  if (!REVIEW_EMAIL || !REVIEW_PASSWORD) {
    return unauthorized('Reviewer login is not configured.');
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  if (normalizedEmail !== REVIEW_EMAIL || !passwordsMatch(body.password)) {
    return unauthorized('Invalid credentials.');
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return unauthorized('Account not found.');
  }
  if (user.deleted) {
    await reactivateDeletedUser(user.id);
  }

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
    provider: 'review',
    providerAccountId: user.id,
  });
}, 'Failed to sign in with reviewer account');
