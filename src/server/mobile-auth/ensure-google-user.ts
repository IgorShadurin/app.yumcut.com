import { TokenPayload } from 'google-auth-library';
import { User } from '@prisma/client';
import { ensureOAuthUser } from './ensure-oauth-user';

export type GoogleProfile = Pick<TokenPayload, 'sub' | 'email' | 'name' | 'picture' | 'email_verified'>;

export function ensureGoogleUser(profile: GoogleProfile, idToken: string): Promise<User> {
  return ensureOAuthUser({
    provider: 'google',
    profile: {
      providerAccountId: profile.sub || '',
      email: profile.email || '',
      name: profile.name,
      image: profile.picture,
      emailVerified: profile.email_verified,
    },
    idToken,
  });
}
