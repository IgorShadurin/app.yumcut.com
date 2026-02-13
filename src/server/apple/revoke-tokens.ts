import { config } from '@/server/config';
import { createAppleClientSecret } from './client-secret';

const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

export type AppleTokenRevocationRequest = {
  token: string;
  tokenTypeHint: 'access_token' | 'refresh_token';
  clientId?: string;
};

export async function revokeAppleTokens(requests: AppleTokenRevocationRequest[]): Promise<void> {
  if (!requests.length) {
    return;
  }

  const deduped: AppleTokenRevocationRequest[] = [];
  const seen = new Set<string>();
  for (const req of requests) {
    if (!req.token) continue;
    const key = `${req.tokenTypeHint}:${req.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(req);
  }

  const secretCache = new Map<string, string>();

  await Promise.all(
    deduped.map(async (req) => {
      const clientId = req.clientId ?? config.APPLE_WEB_CLIENT_ID ?? config.APPLE_IOS_CLIENT_ID;
      if (!clientId) {
        console.warn('Skipping Apple token revocation: missing clientId configuration.');
        return;
      }

      if (!secretCache.has(clientId)) {
        secretCache.set(clientId, createAppleClientSecret(clientId) ?? '');
      }
      const clientSecret = secretCache.get(clientId);
      if (!clientSecret) {
        console.warn('Skipping Apple token revocation: unable to generate client secret.');
        return;
      }

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token: req.token,
        token_type_hint: req.tokenTypeHint,
      });

      try {
        const response = await fetch(APPLE_REVOKE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });
        if (!response.ok) {
          console.warn('Apple token revocation failed', {
            status: response.status,
            statusText: response.statusText,
          });
        }
      } catch (err) {
        console.warn('Apple token revocation error', err);
      }
    })
  );
}
