"use client";

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type AccountSummaryCopy = {
  overviewTitle: string;
  nameLabel: string;
  emailLabel: string;
  userIdLabel: string;
  createdAtLabel: string;
  tokensTitle: string;
  currentBalanceLabel: string;
  balanceSuffix: string;
  costsTitle: string;
  projectCreationCost: (minSeconds: number) => string;
  scriptRefinementCost: (tokens: number) => string;
  audioRegenerationCost: (tokens: number) => string;
  customCharacterImageCost: (tokens: number) => string;
  tokenActivity: string;
};

const COPY: Record<AppLanguageCode, AccountSummaryCopy> = {
  en: {
    overviewTitle: 'Account overview',
    nameLabel: 'Name',
    emailLabel: 'Email',
    userIdLabel: 'User ID',
    createdAtLabel: 'Account created',
    tokensTitle: 'Tokens',
    currentBalanceLabel: 'Current balance',
    balanceSuffix: 'tokens',
    costsTitle: 'Token costs',
    projectCreationCost: (minSeconds) => `• Project creation: 1 token per second (minimum ${minSeconds} seconds)`,
    scriptRefinementCost: (tokens) => `• Script refinement: ${tokens} tokens`,
    audioRegenerationCost: (tokens) => `• Audio regeneration: ${tokens} tokens`,
    customCharacterImageCost: (tokens) => `• Custom character image: ${tokens} tokens`,
    tokenActivity: 'View token activity',
  },
  ru: {
    overviewTitle: 'Обзор аккаунта',
    nameLabel: 'Имя',
    emailLabel: 'Email',
    userIdLabel: 'ID пользователя',
    createdAtLabel: 'Дата создания аккаунта',
    tokensTitle: 'Токены',
    currentBalanceLabel: 'Текущий баланс',
    balanceSuffix: 'токенов',
    costsTitle: 'Стоимость действий',
    projectCreationCost: (minSeconds) => `• Создание проекта: 1 токен за секунду (минимум ${minSeconds} секунд)`,
    scriptRefinementCost: (tokens) => `• Правка сценария: ${tokens} токенов`,
    audioRegenerationCost: (tokens) => `• Перегенерация озвучки: ${tokens} токенов`,
    customCharacterImageCost: (tokens) => `• Кастомное изображение персонажа: ${tokens} токенов`,
    tokenActivity: 'История токенов',
  },
};

export function AccountOverviewCard({
  name,
  email,
  userId,
  createdLabel,
}: {
  name: string;
  email: string;
  userId: string;
  createdLabel: string;
}) {
  const { language } = useAppLanguage();
  const copy = COPY[language];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.overviewTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">{copy.nameLabel}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">{copy.emailLabel}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{email}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-500 dark:text-gray-400">{copy.userIdLabel}</span>
          <span className="font-mono text-xs text-gray-700 dark:text-gray-200 break-all">{userId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">{copy.createdAtLabel}</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">{createdLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountTokensCard({ balance }: { balance: number }) {
  const { language } = useAppLanguage();
  const copy = COPY[language];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.tokensTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">{copy.currentBalanceLabel}</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {balance.toLocaleString()} {copy.balanceSuffix}
          </span>
        </div>
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
          <p className="font-medium text-gray-800 dark:text-gray-100">{copy.costsTitle}</p>
          <ul className="mt-2 space-y-1">
            <li>{copy.projectCreationCost(TOKEN_COSTS.minimumProjectSeconds)}</li>
            <li>{copy.scriptRefinementCost(TOKEN_COSTS.actions.scriptRevision)}</li>
            <li>{copy.audioRegenerationCost(TOKEN_COSTS.actions.audioRegeneration)}</li>
            <li>{copy.customCharacterImageCost(TOKEN_COSTS.actions.characterImage)}</li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/tokens/activity">{copy.tokenActivity}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
