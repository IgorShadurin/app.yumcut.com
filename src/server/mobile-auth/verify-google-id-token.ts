import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { config } from '@/server/config';

let cachedClient: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (cachedClient) return cachedClient;
  cachedClient = new OAuth2Client();
  return cachedClient;
}

export async function verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
  const audiences = [config.GOOGLE_IOS_CLIENT_ID, config.GOOGLE_CLIENT_ID].filter(Boolean) as string[];
  if (!audiences.length) {
    throw new Error('GOOGLE_IOS_CLIENT_ID or GOOGLE_CLIENT_ID must be configured to verify Google ID tokens.');
  }
  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: audiences.length === 1 ? audiences[0] : audiences,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Google verification returned an empty payload.');
  }
  if (!payload.sub) {
    throw new Error('Google payload missing subject identifier.');
  }
  if (!payload.email) {
    throw new Error('Google payload missing e-mail address.');
  }
  return payload;
}
