import { prisma } from '@/server/db';
import { LANGUAGES, type TargetLanguageCode } from '@/shared/constants/languages';
import { encryptToken } from '@/server/crypto/publish-tokens';

const PROVIDERS = new Set(['youtube']);

export async function listPublishChannels(userId: string) {
  return prisma.publishChannel.findMany({
    where: { userId },
    include: { assignments: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createPublishChannel(userId: string, payload: {
  provider: string;
  channelId: string;
  displayName?: string | null;
  handle?: string | null;
  refreshToken?: string | null;
  accessToken?: string | null;
  tokenExpiresAt?: Date | null;
  scopes?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (!PROVIDERS.has(payload.provider)) {
    throw new Error('Unsupported provider');
  }
  if (!payload.channelId?.trim()) {
    throw new Error('Channel ID is required');
  }
  return prisma.publishChannel.create({
    data: {
      userId,
      provider: payload.provider,
      channelId: payload.channelId.trim(),
      displayName: payload.displayName?.trim() || null,
      handle: payload.handle?.trim() || null,
      refreshToken: encryptToken(payload.refreshToken),
      accessToken: encryptToken(payload.accessToken),
      tokenExpiresAt: payload.tokenExpiresAt ?? null,
      scopes: payload.scopes ?? null,
      metadata: (payload.metadata ?? undefined) as any,
    },
    include: { assignments: true },
  });
}

export async function updateChannelLanguages(userId: string, channelId: string, languages: string[]) {
  const channel = await prisma.publishChannel.findFirst({ where: { id: channelId, userId } });
  if (!channel) throw new Error('Channel not found');
  const allowed = new Set<TargetLanguageCode>(LANGUAGES.map((lang) => lang.code));
  const unique = Array.from(new Set(languages.map((lang) => lang.trim().toLowerCase()))).filter((code): code is TargetLanguageCode => allowed.has(code as TargetLanguageCode));
  await prisma.$transaction(async (tx) => {
    await tx.publishChannelLanguage.deleteMany({ where: { channelId } });
    if (unique.length === 0) return;
    await tx.publishChannelLanguage.createMany({
      data: unique.map((languageCode) => ({ channelId, userId, languageCode, createdAt: new Date() })),
    });
  });
  return prisma.publishChannel.findUnique({ where: { id: channelId }, include: { assignments: true } });
}

export async function deletePublishChannel(userId: string, channelId: string) {
  const channel = await prisma.publishChannel.findFirst({ where: { id: channelId, userId } });
  if (!channel) throw new Error('Channel not found');
  await prisma.publishChannel.delete({ where: { id: channelId } });
  return true;
}

export async function revokePublishChannelTokens(userId: string, channelId: string) {
  const channel = await prisma.publishChannel.findFirst({ where: { id: channelId, userId } });
  if (!channel) throw new Error('Channel not found');
  return prisma.publishChannel.update({
    where: { id: channelId },
    data: {
      refreshToken: null,
      accessToken: null,
      tokenExpiresAt: null,
      scopes: null,
      disconnectedAt: new Date(),
    },
    include: { assignments: true },
  });
}

export function getSupportedPublishProviders() {
  return Array.from(PROVIDERS.values());
}

export async function upsertPublishChannelFromOAuth(userId: string, payload: {
  provider: string;
  channelId: string;
  displayName: string | null;
  handle: string | null;
  refreshToken: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  scopes?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const existing = await prisma.publishChannel.findFirst({
    where: { userId, provider: payload.provider, channelId: payload.channelId },
  });
  const data = {
    displayName: payload.displayName,
    handle: payload.handle,
    refreshToken: encryptToken(payload.refreshToken),
    accessToken: encryptToken(payload.accessToken),
    tokenExpiresAt: payload.tokenExpiresAt,
    scopes: payload.scopes ?? null,
    metadata: (payload.metadata ?? undefined) as any,
    disconnectedAt: null,
  };
  if (existing) {
    await prisma.publishChannel.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  await prisma.publishChannel.create({
    data: {
      userId,
      provider: payload.provider,
      channelId: payload.channelId,
      displayName: payload.displayName,
      handle: payload.handle,
      refreshToken: encryptToken(payload.refreshToken),
      accessToken: encryptToken(payload.accessToken),
      tokenExpiresAt: payload.tokenExpiresAt,
      scopes: payload.scopes ?? null,
      metadata: (payload.metadata ?? undefined) as any,
    },
  });
}
