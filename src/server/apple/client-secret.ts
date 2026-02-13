import jwt from 'jsonwebtoken';
import { config } from '@/server/config';

const APPLE_AUDIENCE = 'https://appleid.apple.com';

export type AppleRestCredentials = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
};

export function getAppleRestCredentials(clientId?: string): AppleRestCredentials | null {
  const resolvedClientId = clientId ?? config.APPLE_WEB_CLIENT_ID ?? config.APPLE_IOS_CLIENT_ID;
  if (!resolvedClientId) {
    return null;
  }
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = config;
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    return null;
  }
  return {
    clientId: resolvedClientId,
    teamId: APPLE_TEAM_ID,
    keyId: APPLE_KEY_ID,
    privateKey: normalizeApplePrivateKey(APPLE_PRIVATE_KEY),
  };
}

export function createAppleClientSecret(clientId?: string): string | null {
  const creds = getAppleRestCredentials(clientId);
  if (!creds) {
    return null;
  }
  try {
    return jwt.sign({}, creds.privateKey, {
      algorithm: 'ES256',
      expiresIn: '180d',
      audience: APPLE_AUDIENCE,
      issuer: creds.teamId,
      subject: creds.clientId,
      keyid: creds.keyId,
    });
  } catch (err) {
    console.error('Failed to generate Apple client secret', err);
    return null;
  }
}

function normalizeApplePrivateKey(value: string) {
  const content = value.includes('BEGIN PRIVATE KEY') ? value : `-----BEGIN PRIVATE KEY-----\n${value}\n-----END PRIVATE KEY-----`;
  return content.replace(/\\n/g, '\n');
}
