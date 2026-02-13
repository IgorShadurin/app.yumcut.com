import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/server/errors';
import { error } from '@/server/http';
import { config } from '@/server/config';
import { consumeOAuthState } from '@/server/publishing/oauth';
import { upsertPublishChannelFromOAuth } from '@/server/publishing/channels';
import { OAuth2Client } from 'google-auth-library';

function getBaseUrl() {
  const fromEnv =
    process.env.NEXTAUTH_URL
    || process.env.APP_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return (fromEnv && fromEnv.replace(/\/$/, '')) || 'http://localhost:3000';
}

async function fetchChannelProfile(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch channel profile (${res.status})`);
  }
  const json = await res.json();
  const first = json.items?.[0];
  if (!first) throw new Error('No channel associated with this account');
  return {
    channelId: first.id as string,
    title: first.snippet?.title as string | undefined,
    handle: first.snippet?.customUrl as string | undefined,
    thumbnail: first.snippet?.thumbnails?.default?.url as string | undefined,
  };
}

export const GET = withApiError(async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const state = params.get('state');
  const code = params.get('code');
  const errorParam = params.get('error');
  if (errorParam) {
    return NextResponse.json({ error: { message: errorParam } }, { status: 400 });
  }
  if (!state || !code) {
    return error('INVALID_OAUTH', 'Missing OAuth parameters', 400);
  }
  const record = await consumeOAuthState(state);
  if (!record) {
    return error('EXPIRED_STATE', 'OAuth session expired, please try again.', 400);
  }
  if (!config.YOUTUBE_CLIENT_ID || !config.YOUTUBE_CLIENT_SECRET) {
    return error('CONFIG_ERROR', 'YouTube OAuth misconfigured', 500);
  }
  const redirectUri = `${getBaseUrl()}/api/scheduler/channels/oauth/callback`;
  const oauth = new OAuth2Client(config.YOUTUBE_CLIENT_ID, config.YOUTUBE_CLIENT_SECRET, redirectUri);
  let tokens;
  try {
    const result = await oauth.getToken({ code, codeVerifier: record.codeVerifier });
    tokens = result.tokens;
  } catch (err) {
    return error('TOKEN_EXCHANGE_FAILED', (err as Error).message, 400);
  }
  if (!tokens.refresh_token) {
    return error('MISSING_REFRESH_TOKEN', 'Google did not return a refresh token. Ensure you allow offline access.', 400);
  }
  const accessToken = tokens.access_token;
  if (!accessToken) {
    return error('MISSING_ACCESS_TOKEN', 'Missing access token in Google response.', 400);
  }
  const profile = await fetchChannelProfile(accessToken);
  await upsertPublishChannelFromOAuth(record.userId, {
    provider: 'youtube',
    channelId: profile.channelId,
    displayName: profile.title ?? null,
    handle: profile.handle ?? null,
    refreshToken: tokens.refresh_token,
    accessToken,
    tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: 'https://www.googleapis.com/auth/youtube.upload',
    metadata: profile.thumbnail ? { thumbnail: profile.thumbnail } : null,
  });
  const successHtml = `<!DOCTYPE html><html><body><p>Channel connected. You can close this window.</p><script>window.close && window.close();</script></body></html>`;
  return new NextResponse(successHtml, { headers: { 'content-type': 'text/html' } });
}, 'Failed to complete OAuth');
