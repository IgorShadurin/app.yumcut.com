import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { verifyMobileAccessToken } from '@/server/mobile-auth';
import { prisma } from '@/server/db';

export interface AuthenticatedApiUser {
  userId: string;
  sessionUser?: {
    id: string;
    email?: string | null;
    name?: string | null;
    isAdmin?: boolean;
  };
  source: 'session' | 'mobile';
}

function extractBearerToken(req?: NextRequest): string | null {
  if (!req) return null;
  const header = req.headers.get('authorization');
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function authenticateApiRequest(req?: NextRequest): Promise<AuthenticatedApiUser | null> {
  const bearer = extractBearerToken(req);
  if (bearer) {
    try {
      const claims = await verifyMobileAccessToken(bearer);
      if (claims?.sub) {
        return { userId: claims.sub, source: 'mobile' };
      }
    } catch {
      // fall through to session auth
    }
  }

  const session = await getAuthSession();
  if (session?.user && (session.user as any).id) {
    const typedUser = session.user as any;
    const dbUser = await prisma.user.findUnique({
      where: { id: typedUser.id as string },
      select: { deleted: true },
    });
    if (!dbUser || dbUser.deleted) {
      return null;
    }
    return {
      userId: typedUser.id as string,
      sessionUser: {
        id: typedUser.id as string,
        email: typedUser.email ?? null,
        name: typedUser.name ?? null,
        isAdmin: !!typedUser.isAdmin,
      },
      source: 'session',
    };
  }

  return null;
}
