import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { ok, unauthorized, conflict, error as errorResponse } from '@/server/http';
import { withApiError } from '@/server/errors';
import { requireMobileUserId } from '@/app/api/mobile/shared/auth';
import {
  verifyAppleIdentityToken,
  verifyGoogleIdToken,
  issueMobileSessionTokens,
  mergeGuestIntoUser,
} from '@/server/mobile-auth';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';
import { notifyAdminsOfGuestConversion } from '@/server/telegram';

const BaseSchema = z.object({
  deviceId: z.string().min(3).max(191),
  deviceName: z.string().min(1).max(191).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
});

const BodySchema = z.discriminatedUnion('provider', [
  BaseSchema.extend({
    provider: z.literal('apple'),
    identityToken: z.string().min(20),
    fullName: z.string().max(191).optional(),
  }),
  BaseSchema.extend({
    provider: z.literal('google'),
    idToken: z.string().min(20),
  }),
]);

export const POST = withApiError(async function POST(req: NextRequest) {
  const auth = await requireMobileUserId(req);
  if ('error' in auth) {
    return auth.error;
  }

  const json = await req.json().catch(() => null);
  const body = BodySchema.parse(json);

  const guestUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, isGuest: true, deleted: true, email: true, name: true, image: true },
  });
  if (!guestUser) {
    return unauthorized('User not found.');
  }
  if (!guestUser.isGuest) {
    return conflict('Account already linked.');
  }
  if (guestUser.deleted) {
    await reactivateDeletedUser(guestUser.id);
  }

  const metadata = extractMetadata(body);
  if (!metadata.deviceId) {
    return errorResponse('BAD_REQUEST', 'deviceId is required.', 400);
  }

  const providerPayload = await resolveProviderPayload(body);
  const providerAccountId = providerPayload.providerAccountId;
  const normalizedEmail = providerPayload.email?.toLowerCase();
  if (!normalizedEmail) {
    return errorResponse('BAD_REQUEST', 'Provider did not return an email address.', 400);
  }

  let targetUserId: string | null = null;
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: body.provider,
        providerAccountId,
      },
    },
    select: { userId: true, user: { select: { deleted: true } } },
  });
  if (existingAccount) {
    targetUserId = existingAccount.userId;
    if (existingAccount.user?.deleted) {
      await reactivateDeletedUser(existingAccount.userId);
    }
  }

  if (!targetUserId) {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, deleted: true } });
    if (existingUser) {
      targetUserId = existingUser.id;
      if (existingUser.deleted) {
        await reactivateDeletedUser(existingUser.id);
      }
    }
  }

  let finalUserId = guestUser.id;
  if (targetUserId && targetUserId !== guestUser.id) {
    await mergeGuestIntoUser({ guestUserId: guestUser.id, targetUserId });
    finalUserId = targetUserId;
  } else {
    await prisma.user.update({
      where: { id: guestUser.id },
      data: {
        email: normalizedEmail,
        name: providerPayload.name ?? guestUser.name,
        image: providerPayload.image ?? guestUser.image,
        emailVerified: providerPayload.emailVerified ?? undefined,
        isGuest: false,
        guestConvertedAt: new Date(),
        deleted: false,
      },
    });
  }

  await linkProviderAccount({
    provider: body.provider,
    providerAccountId,
    userId: finalUserId,
    idToken: providerPayload.idToken,
  });

  await prisma.user.update({
    where: { id: finalUserId },
    data: {
      isGuest: false,
      guestConvertedAt: new Date(),
      emailVerified: providerPayload.emailVerified ?? undefined,
    },
  });

  const session = await issueMobileSessionTokens({
    userId: finalUserId,
    deviceId: metadata.deviceId,
    deviceName: metadata.deviceName,
    platform: metadata.platform,
    appVersion: metadata.appVersion,
  });

  const finalUser = await prisma.user.findUnique({
    where: { id: finalUserId },
    select: { id: true, email: true, name: true, image: true },
  });

  notifyAdminsOfGuestConversion({
    guestUserId: guestUser.id,
    finalUserId,
    userEmail: finalUser?.email ?? normalizedEmail,
    userName: finalUser?.name ?? providerPayload.name ?? null,
    provider: body.provider,
    mergedIntoExisting: Boolean(targetUserId && targetUserId !== guestUser.id),
  }).catch((err) => {
    console.error('Failed to notify admins of guest conversion', err);
  });

  return ok({
    user: finalUser,
    tokens: session,
    provider: body.provider,
    providerAccountId,
  });
}, 'Failed to upgrade guest account');

function extractMetadata(body: z.infer<typeof BaseSchema>) {
  return {
    deviceId: body.deviceId.trim(),
    deviceName: body.deviceName?.trim() || undefined,
    platform: body.platform?.trim() || undefined,
    appVersion: body.appVersion?.trim() || undefined,
  };
}

async function resolveProviderPayload(
  body: z.infer<typeof BodySchema>,
): Promise<{
  providerAccountId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: Date;
  idToken: string;
}> {
  if (body.provider === 'apple') {
    const payload = await verifyAppleIdentityToken(body.identityToken);
    return {
      providerAccountId: payload.sub,
      email: payload.email || '',
      name: body.fullName ?? null,
      emailVerified: resolveEmailVerified(payload.email_verified),
      idToken: body.identityToken,
    };
  }
  const payload = await verifyGoogleIdToken(body.idToken);
  return {
    providerAccountId: payload.sub!,
    email: payload.email!,
    name: payload.name,
    image: payload.picture,
    emailVerified: resolveEmailVerified(payload.email_verified),
    idToken: body.idToken,
  };
}

async function linkProviderAccount(params: {
  provider: 'apple' | 'google';
  providerAccountId: string;
  userId: string;
  idToken: string;
}) {
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: params.provider,
        providerAccountId: params.providerAccountId,
      },
    },
    update: {
      userId: params.userId,
      id_token: params.idToken,
    },
    create: {
      userId: params.userId,
      provider: params.provider,
      type: 'oauth',
      providerAccountId: params.providerAccountId,
      id_token: params.idToken,
    },
  });
}

function resolveEmailVerified(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'boolean') return value ? new Date() : undefined;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return new Date();
    const timestamp = Number(value);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp * (timestamp < 1e12 ? 1000 : 1));
    }
  }
  return undefined;
}
