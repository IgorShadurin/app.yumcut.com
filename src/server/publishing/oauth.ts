import crypto from 'crypto';
import { prisma } from '@/server/db';

export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

export function buildCodeChallenge(verifier: string) {
  return crypto.createHash('sha256').update(verifier).digest().toString('base64url');
}

export async function createOAuthState(userId: string, provider: string) {
  const verifier = generateCodeVerifier();
  const state = crypto.randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.publishChannelOAuthState.create({
    data: {
      userId,
      provider,
      state,
      codeVerifier: verifier,
      expiresAt,
    },
  });
  return { state, verifier, expiresAt };
}

export async function consumeOAuthState(state: string) {
  const record = await prisma.publishChannelOAuthState.findUnique({ where: { state } });
  if (!record) return null;
  await prisma.publishChannelOAuthState.delete({ where: { id: record.id } });
  if (record.expiresAt.getTime() < Date.now()) return null;
  return record;
}
