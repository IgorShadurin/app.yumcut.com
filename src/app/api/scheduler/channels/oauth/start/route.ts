import { withApiError } from '@/server/errors';
import { ok, unauthorized, forbidden, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { isPublishSchedulerEnabledForUser } from '@/server/features/publish-scheduler';
import { config } from '@/server/config';
import { createOAuthState, buildCodeChallenge } from '@/server/publishing/oauth';

function getBaseUrl() {
  const fromEnv =
    process.env.NEXTAUTH_URL
    || process.env.APP_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return (fromEnv && fromEnv.replace(/\/$/, '')) || 'http://localhost:3000';
}

export const POST = withApiError(async function POST() {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  if (!isPublishSchedulerEnabledForUser({ id: userId })) {
    return forbidden('Scheduler is disabled');
  }
  if (!config.YOUTUBE_CLIENT_ID || !config.YOUTUBE_CLIENT_SECRET) {
    return error('CONFIG_ERROR', 'YouTube OAuth is not configured', 500);
  }
  const { state, verifier } = await createOAuthState(userId, 'youtube');
  const redirectUri = `${getBaseUrl()}/api/scheduler/channels/oauth/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.YOUTUBE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('code_challenge', buildCodeChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return ok({ authUrl: url.toString() });
}, 'Failed to start OAuth');
