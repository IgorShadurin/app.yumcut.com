import { redirect } from 'next/navigation';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { TelegramIntegrationCard } from '@/components/account/telegram-integration-card';
import { DeleteAccountCard } from '@/components/account/delete-account-card';
import { isTelegramEnabled } from '@/server/telegram';
import { config } from '@/server/config';
import { formatDateTime } from '@/lib/date';
import { LanguagePreferenceCard } from '@/components/account/language-preference-card';
import { normalizeAppLanguage } from '@/shared/constants/app-language';
import { AccountOverviewCard, AccountTokensCard } from '@/components/account/account-summary-cards';

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
};

export default async function AccountPage() {
  const session = await getAuthSession();
  const userSession = session?.user as SessionUser | undefined;
  if (!userSession?.id) {
    redirect('/');
  }
  const userId = userSession.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      tokenBalance: true,
      preferredLanguage: true,
      telegramAccount: {
        select: {
          username: true,
          firstName: true,
          lastName: true,
          linkedAt: true,
        },
      },
    },
  });
  if (!user) {
    redirect('/');
  }

  let createdLabel = 'Unknown';
  try {
    createdLabel = formatDateTime(user.createdAt);
  } catch {
    createdLabel = user.createdAt.toISOString();
  }
  const name = user.name?.trim() || '—';
  const email = user.email || '—';
  const balance = user.tokenBalance;
  const telegramEnabled = isTelegramEnabled();
  const botUsername = config.TELEGRAM_BOT_USERNAME ?? null;
  const telegramAccount = user.telegramAccount
    ? {
        username: user.telegramAccount.username,
        firstName: user.telegramAccount.firstName,
        lastName: user.telegramAccount.lastName,
        linkedAt: user.telegramAccount.linkedAt.toISOString(),
      }
    : null;
  const preferredLanguage = normalizeAppLanguage(user.preferredLanguage);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <AccountOverviewCard
        name={name}
        email={email}
        userId={user.id}
        createdLabel={createdLabel}
      />

      <LanguagePreferenceCard initialLanguage={preferredLanguage} />
      <AccountTokensCard balance={balance} />

      <TelegramIntegrationCard
        telegramEnabled={telegramEnabled}
        botUsername={botUsername}
        initialAccount={telegramAccount}
      />
      <DeleteAccountCard />
    </div>
  );
}
