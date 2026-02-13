import { Prisma, User } from '@prisma/client';
import { prisma } from '@/server/db';
import { grantTokens, makeSystemInitiator, TOKEN_TRANSACTION_TYPES } from '@/server/tokens';
import { notifyAdminsOfNewUser } from '@/server/telegram';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { reactivateDeletedUser } from '@/server/account/reactivate-user';

export type OAuthProfile = {
  providerAccountId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean | string | Date | null;
};

export type EnsureOAuthUserOptions = {
  provider: 'google' | 'apple';
  profile: OAuthProfile;
  idToken?: string | null;
};

export async function ensureOAuthUser(options: EnsureOAuthUserOptions): Promise<User> {
  const { provider, profile, idToken } = options;
  if (!profile.providerAccountId) {
    throw new Error(`Missing providerAccountId for ${provider} profile.`);
  }
  if (!profile.email) {
    throw new Error(`Missing email in ${provider} profile.`);
  }

  const normalizedEmail = profile.email.toLowerCase();

  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existingAccount?.user) {
    if ((existingAccount.user as any).deleted) {
      await reactivateDeletedUser(existingAccount.user.id);
    }
    const updated = await maybeUpdateUser(existingAccount.user.id, profile, existingAccount.user);
    await persistAccount(provider, existingAccount.user.id, profile.providerAccountId, idToken);
    return updated;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser?.deleted) {
    await reactivateDeletedUser(existingUser.id);
  }
  let user: User;
  let isNewUser = false;
  if (!existingUser) {
    isNewUser = true;
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: profile.name,
        image: profile.image,
        emailVerified: resolveEmailVerified(profile.emailVerified),
      },
    });
  } else {
    user = await maybeUpdateUser(existingUser.id, profile, existingUser);
  }

  await persistAccount(provider, user.id, profile.providerAccountId, idToken);

  if (isNewUser) {
    await afterUserCreated(user, profile.name);
  }

  return user;
}

async function maybeUpdateUser(userId: string, profile: OAuthProfile, existing?: User): Promise<User> {
  const updates: Prisma.UserUpdateInput = {};
  if (profile.name && !existing?.name) {
    updates.name = profile.name;
  }
  if (profile.image && !existing?.image) {
    updates.image = profile.image;
  }
  const verifiedAt = resolveEmailVerified(profile.emailVerified);
  if (verifiedAt && !existing?.emailVerified) {
    updates.emailVerified = verifiedAt;
  }

  if (Object.keys(updates).length === 0) {
    return existing ?? (await prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }
  return prisma.user.update({ where: { id: userId }, data: updates });
}

async function persistAccount(provider: string, userId: string, providerAccountId: string, idToken?: string | null) {
  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    create: {
      userId,
      provider,
      type: 'oauth',
      providerAccountId,
      id_token: idToken,
    },
    update: {
      userId,
      id_token: idToken ?? undefined,
    },
  });
}

function resolveEmailVerified(value: OAuthProfile['emailVerified']) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'boolean') return value ? new Date() : undefined;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return new Date();
    const timestamp = Number(value);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp * (timestamp < 1e12 ? 1000 : 1));
    }
  }
  return undefined;
}

async function afterUserCreated(user: { id: string; email: string }, name?: string | null) {
  const bonusAmount = TOKEN_COSTS.signUpBonus;
  if (bonusAmount > 0) {
    try {
      await grantTokens({
        userId: user.id,
        amount: bonusAmount,
        type: TOKEN_TRANSACTION_TYPES.signUpBonus,
        description: 'New account bonus',
        initiator: makeSystemInitiator('signup-mobile'),
      });
    } catch (err) {
      console.error('Failed to grant signup tokens (mobile auth)', err);
    }
  }
  notifyAdminsOfNewUser({ userId: user.id, email: user.email, name }).catch((err) => {
    console.error('Failed to notify admins about new mobile user', err);
  });
}
