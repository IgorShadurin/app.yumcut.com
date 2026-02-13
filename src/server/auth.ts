import NextAuth, { NextAuthOptions, getServerSession } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import AppleProvider from 'next-auth/providers/apple';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './db';
import { config } from './config';
import { grantTokens, makeSystemInitiator, TOKEN_TRANSACTION_TYPES } from './tokens';
import { notifyAdminsOfNewUser } from './telegram';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { createAppleClientSecret } from '@/server/apple/client-secret';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';
import { cookies } from 'next/headers';
import { readUtmSourceCookie, UTM_SOURCE_COOKIE_NAME } from '@/shared/utm/helpers';

const oauthProviders = [];
const enabledProviderIds = new Set<string>();

const nextAuthUrl = process.env.NEXTAUTH_URL;
if (
  process.env.NODE_ENV === 'production' &&
  nextAuthUrl &&
  /localhost|127\.0\.0\.1/i.test(nextAuthUrl)
) {
  // eslint-disable-next-line no-console
  console.warn(
    'NEXTAUTH_URL points to localhost while NODE_ENV=production. Use the public domain (e.g. https://app.yumcut.com) so PKCE cookies survive across redirects.'
  );
}
const useSecureCookies = nextAuthUrl?.startsWith('https://') ?? process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';
const pkceSameSite = useSecureCookies ? ('none' as const) : ('lax' as const);

const googleClientId = config.GOOGLE_CLIENT_ID;
const googleClientSecret = config.GOOGLE_CLIENT_SECRET;
const allowNoOauth = process.env.ALLOW_NO_OAUTH === '1' || process.env.CI === 'true';
const logPlaceholderAuth =
  !process.env.CI &&
  process.env.NODE_ENV !== 'test' &&
  process.env.LOG_PLACEHOLDER_AUTH === '1';

if (googleClientId && googleClientSecret) {
  oauthProviders.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    })
  );
  enabledProviderIds.add('google');
} else if (googleClientId || googleClientSecret) {
  if (!allowNoOauth) {
    console.warn('Google OAuth provider is not fully configured; GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.');
  }
}

const appleProvider = buildAppleProvider();
if (appleProvider) {
  oauthProviders.push(appleProvider);
  enabledProviderIds.add('apple');
}

if (oauthProviders.length === 0) {
  if (allowNoOauth) {
    oauthProviders.push(
      CredentialsProvider({
        name: 'placeholder',
        credentials: {},
        authorize: async () => null,
      })
    );
    if (logPlaceholderAuth) {
      // eslint-disable-next-line no-console
      console.warn('ALLOW_NO_OAUTH is enabled; using placeholder auth provider for build/tests.');
    }
  } else {
    throw new Error('At least one OAuth provider (Google or Apple) must be configured.');
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: oauthProviders,
  session: {
    strategy: 'jwt',
  },
  cookies: {
    pkceCodeVerifier: {
      name: `${cookiePrefix}next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: pkceSameSite,
        path: '/',
        secure: useSecureCookies,
        maxAge: 60 * 15,
      },
    },
    state: {
      name: `${cookiePrefix}next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: pkceSameSite,
        path: '/',
        secure: useSecureCookies,
        maxAge: 60 * 15,
      },
    },
  },
  // Suppress noisy logs during successful auth flows
  debug: false,
  logger: {
    // Only log errors; drop warn/debug to keep console clean unless failures occur
    error(code: any, metadata?: unknown) {
      try {
        // eslint-disable-next-line no-console
        console.error('[next-auth][error]', code, metadata ?? '');
      } catch {}
    },
    warn(code: any, metadata?: unknown) {
      if (!metadata) return;
      // eslint-disable-next-line no-console
      console.warn('[next-auth][warn]', code, metadata);
    },
    debug(_code: any) {
      // no-op (reduce noise in prod); enable if future troubleshooting requires
    },
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (!account?.provider || !enabledProviderIds.has(account.provider)) return false;

      if (!(await allowEmailLinking(account, profile))) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (token.sub) {
        if (user) {
          try {
            const dbUser = await prisma.user.findUnique({ where: { id: token.sub }, select: { isAdmin: true } });
            token.isAdmin = !!dbUser?.isAdmin;
          } catch {
            token.isAdmin = false;
          }
        } else if (trigger === 'update' || typeof token.isAdmin === 'undefined') {
          try {
            const dbUser = await prisma.user.findUnique({ where: { id: token.sub }, select: { isAdmin: true } });
            token.isAdmin = !!dbUser?.isAdmin;
          } catch {
            token.isAdmin = false;
          }
        }
      }
      if (typeof token.isAdmin === 'undefined') token.isAdmin = false;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
        (session.user as any).isAdmin = !!token.isAdmin;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user?.id) return;
      const utmSource = await readUtmSourceCookieFromRequest();
      const bonusAmount = TOKEN_COSTS.signUpBonus;
      if (bonusAmount > 0) {
        try {
          await grantTokens({
            userId: user.id,
            amount: bonusAmount,
            type: TOKEN_TRANSACTION_TYPES.signUpBonus,
            description: 'New account bonus',
            initiator: makeSystemInitiator('signup'),
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Failed to grant signup tokens', e);
        }
      }
      notifyAdminsOfNewUser({
        userId: user.id,
        email: user.email,
        name: user.name,
        ...(utmSource ? { utmSource } : {}),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to notify admins about new user', err);
      });
    },
  },
  pages: {},
  secret: process.env.NEXTAUTH_SECRET,
};

export const getAuthSession = () => {
  return getServerSession(authOptions);
};

export const { auth: nextAuthHandler } = NextAuth(authOptions);

async function readUtmSourceCookieFromRequest() {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(UTM_SOURCE_COOKIE_NAME)?.value;
    return readUtmSourceCookie(value);
  } catch {
    return null;
  }
}

export function assertServiceAuth(req: Request) {
  const header = req.headers.get('x-service-password');
  if (!header || header !== process.env.SERVICE_API_PASSWORD) {
    return false;
  }
  return true;
}

export async function assertDaemonAuth(req: Request): Promise<string | null> {
  const passwordHeader = req.headers.get('x-daemon-password');
  if (!passwordHeader || passwordHeader !== process.env.DAEMON_API_PASSWORD) {
    return null;
  }
  const daemonIdHeader = req.headers.get('x-daemon-id');
  const daemonId = daemonIdHeader?.trim() ?? '';
  if (!daemonId) return null;
  await prisma.daemon.upsert({
    where: { id: daemonId },
    update: { lastSeenAt: new Date() },
    create: { id: daemonId, lastSeenAt: new Date() },
  });
  return daemonId;
}

function buildAppleProvider() {
  const { APPLE_WEB_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = config;
  if (!APPLE_WEB_CLIENT_ID) {
    return null;
  }
  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    console.warn('Apple Sign in requires APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY to be set.');
    return null;
  }

  const clientSecret = createAppleClientSecret(APPLE_WEB_CLIENT_ID);
  if (!clientSecret) {
    console.error('Failed to generate Apple client secret.');
    return null;
  }

  return AppleProvider({
    clientId: APPLE_WEB_CLIENT_ID,
    clientSecret,
    allowDangerousEmailAccountLinking: true,
  });
}

async function allowEmailLinking(account: { provider?: string; providerAccountId?: string | null; type?: string } | null, profile?: Record<string, any>) {
  if (!account || account.type !== 'oauth') return true;
  if (!profile?.email || typeof profile.email !== 'string') return true;
  if (!account.provider || !account.providerAccountId) return true;

  const normalizedEmail = profile.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, deleted: true } });
  if (!existingUser) return true;
  if (existingUser.deleted) {
    await reactivateDeletedUser(existingUser.id);
  }

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      },
    },
    include: { user: { select: { id: true, deleted: true } } },
  });
  if (existingAccount) {
    if (existingAccount.user?.deleted) {
      await reactivateDeletedUser(existingAccount.user.id);
    }
    return true;
  }

  if (!isVerifiedOAuthEmail(account.provider, profile)) {
    console.warn('Blocked auto-linking for unverified OAuth email', {
      provider: account.provider,
      email: normalizedEmail,
    });
    return false;
  }

  return true;
}

function isVerifiedOAuthEmail(provider: string | undefined, profile?: Record<string, any>) {
  if (!profile) return false;
  const raw = profile.email_verified ?? profile.emailVerified;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.toLowerCase() === 'true';
  // Apple always verifies emails before issuing them (real or relay), so treat missing field as trusted.
  if (provider === 'apple') return true;
  return false;
}
