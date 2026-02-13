import { NextRequest } from 'next/server';
import { unauthorized } from '@/server/http';
import { verifyMobileAccessToken } from '@/server/mobile-auth';

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function requireMobileUserId(req: NextRequest): Promise<{ userId: string } | { error: Response }> {
  const token = extractBearerToken(req);
  if (!token) {
    return { error: unauthorized('Missing access token.') };
  }
  const claims = await verifyMobileAccessToken(token);
  if (!claims?.sub) {
    return { error: unauthorized('Invalid or expired access token.') };
  }
  return { userId: claims.sub };
}
