import crypto from 'node:crypto';
import { prisma } from '@/server/db';
import { config } from '@/server/config';
import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';

const encoder = new TextEncoder();
let cachedSecret: Uint8Array | null = null;
let cachedSecretSource: string | null = null;

function getSigningSecret(): Uint8Array {
  const source = config.MOBILE_JWT_SECRET || config.NEXTAUTH_SECRET;
  if (!source) {
    throw new Error('MOBILE_JWT_SECRET (or NEXTAUTH_SECRET) must be configured for mobile auth.');
  }
  if (!cachedSecret || cachedSecretSource !== source) {
    cachedSecret = encoder.encode(source);
    cachedSecretSource = source;
  }
  return cachedSecret;
}

const ACCESS_TOKEN_TTL_MINUTES = config.MOBILE_ACCESS_TOKEN_TTL_MINUTES;
const REFRESH_TOKEN_TTL_DAYS = config.MOBILE_REFRESH_TOKEN_TTL_DAYS;
const ISSUER = 'yumcut-mobile';

export type IssuedMobileSession = {
  sessionId: string;
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export type IssueSessionOptions = {
  userId: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
};

export type RefreshSessionOptions = {
  refreshToken: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
};

export type MobileAccessTokenClaims = JWTPayload & {
  sub: string;
  sid: string;
  deviceId: string;
  type: 'mobile-access';
  isGuest?: boolean;
};

export async function issueMobileSessionTokens(options: IssueSessionOptions): Promise<IssuedMobileSession> {
  const { userId, deviceId, deviceName, platform, appVersion } = options;
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) {
    throw new Error('deviceId is required');
  }
  const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { deleted: true, isGuest: true } });
  if (!userRecord) {
    throw new Error('User not found');
  }
  if (userRecord.deleted) {
    await reactivateDeletedUser(userId);
  }

  await prisma.mobileSession.deleteMany({ where: { userId, deviceId: normalizedDeviceId } });

  const sessionId = crypto.randomUUID();
  const issuedAt = Date.now();
  const refreshToken = crypto.randomBytes(64).toString('hex');
  const refreshTokenHash = hashToken(refreshToken);
  const accessExpiresAt = new Date(issuedAt + ACCESS_TOKEN_TTL_MINUTES * 60 * 1000);
  const refreshExpiresAt = new Date(issuedAt + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const accessToken = await new SignJWT({
    sub: userId,
    sid: sessionId,
    deviceId: normalizedDeviceId,
    type: 'mobile-access',
    isGuest: Boolean(userRecord.isGuest),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(accessExpiresAt)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .sign(getSigningSecret());

  await prisma.mobileSession.create({
    data: {
      id: sessionId,
      userId,
      refreshTokenHash,
      deviceId: normalizedDeviceId,
      deviceName,
      platform,
      appVersion,
      expiresAt: refreshExpiresAt,
      lastRefreshAt: new Date(issuedAt),
    },
  });

  return {
    sessionId,
    userId,
    accessToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export async function refreshMobileSessionTokens(options: RefreshSessionOptions): Promise<IssuedMobileSession | null> {
  const { refreshToken, deviceId, deviceName, platform, appVersion } = options;
  const refreshTokenHash = hashToken(refreshToken);
  const session = await prisma.mobileSession.findFirst({
    where: {
      refreshTokenHash,
      revokedAt: null,
    },
    include: {
      user: { select: { deleted: true, isGuest: true } },
    },
  });
  if (!session) {
    return null;
  }
  if (session.user.deleted) {
    return null;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.mobileSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return null;
  }
  if (deviceId && session.deviceId !== deviceId) {
    return null;
  }

  const newRefreshToken = crypto.randomBytes(64).toString('hex');
  const newRefreshHash = hashToken(newRefreshToken);
  const issuedAt = Date.now();
  const accessExpiresAt = new Date(issuedAt + ACCESS_TOKEN_TTL_MINUTES * 60 * 1000);
  const refreshExpiresAt = new Date(issuedAt + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const accessToken = await new SignJWT({
    sub: session.userId,
    sid: session.id,
    deviceId: session.deviceId,
    type: 'mobile-access',
    isGuest: session.user.isGuest,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(accessExpiresAt)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .sign(getSigningSecret());

  await prisma.mobileSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: newRefreshHash,
      expiresAt: refreshExpiresAt,
      lastRefreshAt: new Date(issuedAt),
      deviceName: deviceName ?? session.deviceName,
      platform: platform ?? session.platform,
      appVersion: appVersion ?? session.appVersion,
    },
  });

  return {
    sessionId: session.id,
    userId: session.userId,
    accessToken,
    accessTokenExpiresAt: accessExpiresAt.toISOString(),
    refreshToken: newRefreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export async function revokeMobileSession(refreshToken: string) {
  const refreshTokenHash = hashToken(refreshToken);
  const session = await prisma.mobileSession.findFirst({ where: { refreshTokenHash } });
  if (!session) return false;
  await prisma.mobileSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return true;
}

export async function verifyMobileAccessToken(token: string): Promise<MobileAccessTokenClaims | null> {
  try {
    const result = await jwtVerify(token, getSigningSecret(), {
      issuer: ISSUER,
      audience: ISSUER,
    });
    const payload = result.payload as MobileAccessTokenClaims;
    if (payload.type !== 'mobile-access') {
      return null;
    }
    const session = await prisma.mobileSession.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, deleted: true, isGuest: true } } },
    });
    if (!session) return null;
    if (session.userId !== payload.sub) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.user.deleted) {
      if (session.user.isGuest) {
        await reactivateDeletedUser(session.user.id);
      } else {
        return null;
      }
    }
    return { ...payload, isGuest: session.user.isGuest };
  } catch {
    return null;
  }
}

function hashToken(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
