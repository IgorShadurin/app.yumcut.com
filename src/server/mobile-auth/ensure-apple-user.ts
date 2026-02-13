import { User } from '@prisma/client';
import { ensureOAuthUser } from './ensure-oauth-user';
import { AppleIdentityTokenPayload } from './verify-apple-identity-token';

export type AppleProfile = Pick<AppleIdentityTokenPayload, 'sub' | 'email' | 'email_verified'> & {
  name?: string | null;
};

export function ensureAppleUser(profile: AppleProfile, identityToken: string, displayName?: string | null): Promise<User> {
  return ensureOAuthUser({
    provider: 'apple',
    profile: {
      providerAccountId: profile.sub || '',
      email: profile.email || '',
      name: displayName ?? profile.name,
      emailVerified: profile.email_verified,
    },
    idToken: identityToken,
  });
}
