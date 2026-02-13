import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { config } from '@/server/config';

const ISSUER = 'https://appleid.apple.com';
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/auth/keys`));

export type AppleIdentityTokenPayload = JWTPayload & {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
};

export async function verifyAppleIdentityToken(identityToken: string, audiences?: string[]): Promise<AppleIdentityTokenPayload> {
  const allowedAudiences = resolveAudiences(audiences);
  if (!allowedAudiences.length) {
    throw new Error('APPLE_IOS_CLIENT_ID or APPLE_WEB_CLIENT_ID must be configured to verify Apple ID tokens.');
  }

  const { payload } = await jwtVerify(identityToken, JWKS, {
    issuer: ISSUER,
    audience: allowedAudiences.length === 1 ? allowedAudiences[0] : allowedAudiences,
  });

  if (!payload.sub) {
    throw new Error('Apple payload missing subject identifier.');
  }
  if (!payload.email) {
    throw new Error('Apple payload missing email address.');
  }

  return payload as AppleIdentityTokenPayload;
}

function resolveAudiences(provided?: string[]) {
  if (provided && provided.length) {
    return provided.filter(Boolean) as string[];
  }
  return [config.APPLE_IOS_CLIENT_ID, config.APPLE_WEB_CLIENT_ID].filter(Boolean) as string[];
}
