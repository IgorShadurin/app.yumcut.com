"use client";
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Api } from '@/lib/api-client';
import type { TokenHistoryDTO, TokenTransactionDTO } from '@/shared/types';
import { useTokenSummary } from '@/hooks/useTokenSummary';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOKEN_TRANSACTION_TYPES } from '@/shared/constants/token-costs';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type TokenActivityCopy = {
  title: string;
  balance: string;
  tokens: string;
  noActivity: string;
  balanceAfter: string;
  initiator: string;
  details: string;
  previous: string;
  next: string;
  journey: string;
  of: string;
  failedToLoad: string;
  failedToLoadHint: string;
  typeLabels: Record<string, string>;
  metadataLabels: Record<string, string>;
};

const COPY: Record<AppLanguageCode, TokenActivityCopy> = {
  en: {
    title: 'Token activity',
    balance: 'Balance',
    tokens: 'tokens',
    noActivity: 'No token activity yet.',
    balanceAfter: 'Balance after',
    initiator: 'Initiator',
    details: 'Details',
    previous: 'Previous',
    next: 'Next',
    journey: 'Journey',
    of: 'of',
    failedToLoad: 'Failed to load activity.',
    failedToLoadHint: 'Please try again.',
    typeLabels: {
      [TOKEN_TRANSACTION_TYPES.signUpBonus]: 'Sign Up Bonus',
      [TOKEN_TRANSACTION_TYPES.adminAdjustment]: 'Admin Adjustment',
      [TOKEN_TRANSACTION_TYPES.projectCreation]: 'Project Creation',
      [TOKEN_TRANSACTION_TYPES.scriptRevision]: 'Script Revision',
      [TOKEN_TRANSACTION_TYPES.audioRegeneration]: 'Audio Regeneration',
      [TOKEN_TRANSACTION_TYPES.imageRegeneration]: 'Image Regeneration',
      [TOKEN_TRANSACTION_TYPES.imageRegenerationRefund]: 'Image Regeneration Refund',
      [TOKEN_TRANSACTION_TYPES.characterImage]: 'Character Image',
      [TOKEN_TRANSACTION_TYPES.subscriptionCredit]: 'Subscription Credit',
    },
    metadataLabels: {
      languagecount: 'Language count',
      durationseconds: 'Duration seconds',
      adjustedby: 'Adjusted by',
      required: 'Required',
      available: 'Available',
      reason: 'Reason',
    },
  },
  ru: {
    title: 'История токенов',
    balance: 'Баланс',
    tokens: 'токенов',
    noActivity: 'Пока нет операций с токенами.',
    balanceAfter: 'Баланс после операции',
    initiator: 'Инициатор',
    details: 'Детали',
    previous: 'Назад',
    next: 'Вперёд',
    journey: 'Путь',
    of: 'из',
    failedToLoad: 'Не удалось загрузить историю.',
    failedToLoadHint: 'Попробуйте ещё раз.',
    typeLabels: {
      [TOKEN_TRANSACTION_TYPES.signUpBonus]: 'Бонус за регистрацию',
      [TOKEN_TRANSACTION_TYPES.adminAdjustment]: 'Корректировка баланса',
      [TOKEN_TRANSACTION_TYPES.projectCreation]: 'Создание проекта',
      [TOKEN_TRANSACTION_TYPES.scriptRevision]: 'Доработка сценария',
      [TOKEN_TRANSACTION_TYPES.audioRegeneration]: 'Перегенерация озвучки',
      [TOKEN_TRANSACTION_TYPES.imageRegeneration]: 'Перегенерация изображения',
      [TOKEN_TRANSACTION_TYPES.imageRegenerationRefund]: 'Возврат за изображение',
      [TOKEN_TRANSACTION_TYPES.characterImage]: 'Генерация персонажа',
      [TOKEN_TRANSACTION_TYPES.subscriptionCredit]: 'Начисление по подписке',
    },
    metadataLabels: {
      languagecount: 'Количество языков',
      durationseconds: 'Длительность (сек)',
      adjustedby: 'Изменил',
      required: 'Требуется',
      available: 'Доступно',
      reason: 'Причина',
    },
  },
};

function makeDateFormatter(language: AppLanguageCode) {
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTypeLabel(type: string, language: AppLanguageCode, copy: TokenActivityCopy) {
  const translated = copy.typeLabels[type];
  if (translated) return translated;
  return type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getMetadataDuration(metadata: unknown): number | null {
  if (!isObjectRecord(metadata)) return null;
  const raw = metadata.durationSeconds ?? metadata.DURATIONSECONDS ?? metadata.durationseconds;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function getFallbackDescription(tx: TokenTransactionDTO, language: AppLanguageCode): string | null {
  const suffixSec = language === 'ru' ? 'с' : 's';
  const duration = getMetadataDuration(tx.metadata);

  switch (tx.type) {
    case TOKEN_TRANSACTION_TYPES.signUpBonus:
      return language === 'ru' ? 'Бонус за регистрацию' : 'New account bonus';
    case TOKEN_TRANSACTION_TYPES.projectCreation:
      return duration != null
        ? (language === 'ru' ? `Создание проекта (${duration}${suffixSec})` : `Project creation (${duration}s)`)
        : (language === 'ru' ? 'Создание проекта' : 'Project creation');
    case TOKEN_TRANSACTION_TYPES.scriptRevision:
      return language === 'ru' ? 'Запрос на доработку сценария' : 'Script refinement request';
    case TOKEN_TRANSACTION_TYPES.audioRegeneration:
      return language === 'ru' ? 'Перегенерация озвучки' : 'Audio regeneration';
    case TOKEN_TRANSACTION_TYPES.imageRegeneration:
      return language === 'ru' ? 'Перегенерация изображения' : 'Image regeneration';
    case TOKEN_TRANSACTION_TYPES.imageRegenerationRefund:
      return language === 'ru' ? 'Возврат за неуспешную перегенерацию изображения' : 'Image regeneration failed';
    case TOKEN_TRANSACTION_TYPES.characterImage:
      return language === 'ru' ? 'Генерация изображения персонажа' : 'Custom character image generation';
    case TOKEN_TRANSACTION_TYPES.subscriptionCredit:
      return language === 'ru' ? 'Начисление токенов по подписке' : 'Subscription credit';
    case TOKEN_TRANSACTION_TYPES.adminAdjustment:
      return language === 'ru' ? 'Корректировка администратором' : 'Adjusted by administrator';
    default:
      return null;
  }
}

function translateKnownInternalDescription(
  description: string,
  tx: TokenTransactionDTO,
  language: AppLanguageCode,
): string | null {
  const value = description.trim();
  if (!value) return null;
  if (language !== 'ru') return value;

  if (/^new account bonus$/i.test(value)) return 'Бонус за регистрацию';
  if (/^project creation \((\d+)s\)$/i.test(value)) {
    return value.replace(/^project creation \((\d+)s\)$/i, 'Создание проекта ($1с)');
  }
  if (/^script refinement request$/i.test(value)) return 'Запрос на доработку сценария';
  if (/^audio regeneration$/i.test(value)) return 'Перегенерация озвучки';
  if (/^image regeneration$/i.test(value)) return 'Перегенерация изображения';
  if (/^image regeneration failed$/i.test(value)) return 'Возврат за неуспешную перегенерацию изображения';
  if (/^custom character image generation$/i.test(value)) return 'Генерация изображения персонажа';
  if (/^adjusted by administrator$/i.test(value)) return 'Корректировка администратором';
  if (/^sign up bonus$/i.test(value)) return 'Бонус за регистрацию';
  if (/^withdraw(al)?$/i.test(value)) return 'Списание';
  if (/^deposit$|^top[ -]?up$/i.test(value)) return 'Пополнение';

  if (/^subscription\s+/i.test(value)) {
    return value.replace(/^subscription\s+/i, 'Подписка ');
  }

  // For explicit internal types, use deterministic RU fallback if we can.
  const fallback = getFallbackDescription(tx, language);
  if (fallback && tx.type !== TOKEN_TRANSACTION_TYPES.adminAdjustment) return fallback;
  return null;
}

function getDisplayDescription(tx: TokenTransactionDTO, language: AppLanguageCode): string | null {
  const raw = tx.description?.trim() || '';
  if (!raw) return getFallbackDescription(tx, language);

  const translatedInternal = translateKnownInternalDescription(raw, tx, language);
  if (translatedInternal) return translatedInternal;

  // Keep custom text unchanged.
  return raw;
}

function getMetadataLabel(key: string, copy: TokenActivityCopy): string {
  const normalized = key.trim().toLowerCase();
  return copy.metadataLabels[normalized] ?? key;
}

export function TokenActivity() {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const dateFormatter = useMemo(() => makeDateFormatter(language), [language]);
  const { balance, refresh: refreshSummary } = useTokenSummary();
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<TokenHistoryDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useMemo(() => {
    return async (nextPage: number) => {
      setLoading(true);
      try {
        const data = await Api.getTokenHistory({ page: nextPage });
        setHistory(data);
        setError(null);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  useEffect(() => {
    refreshSummary().catch(() => {});
  }, [refreshSummary]);

  const transactions = history?.items ?? [];
  const totalPages = history?.totalPages ?? 1;
  const currentPage = history ? history.page : page;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>{copy.title}</CardTitle>
          <div className="text-sm text-gray-500 dark:text-gray-300">
            {copy.balance}:&nbsp;
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {balance.toLocaleString()}
            </span>
            &nbsp;{copy.tokens}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !history ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 dark:border-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-300">
              {copy.noActivity}
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx: TokenTransactionDTO) => {
                const positive = tx.delta >= 0;
                const metadataEntries =
                  tx.metadata && typeof tx.metadata === 'object' && !Array.isArray(tx.metadata)
                    ? Object.entries(tx.metadata as Record<string, unknown>)
                    : [];
                return (
                  <div
                    key={tx.id}
                    className={cn(
                      'rounded-lg border p-4 transition-colors',
                      positive
                        ? 'border-emerald-200/70 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                        : 'border-rose-200/70 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Badge variant={positive ? 'success' : 'danger'} className="mb-2">
                          {formatTypeLabel(tx.type, language, copy)}
                        </Badge>
                        <div className="text-base font-semibold">
                          {positive ? '+' : '-'}{Math.abs(tx.delta).toLocaleString()} {copy.tokens}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                          {copy.balanceAfter}: {tx.balanceAfter.toLocaleString()} {copy.tokens}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                        <div>{dateFormatter.format(new Date(tx.createdAt))}</div>
                        {tx.initiator && (
                          <div className="mt-1">{copy.initiator}: <span className="font-medium text-gray-700 dark:text-gray-200">{tx.initiator}</span></div>
                        )}
                      </div>
                    </div>
                    {getDisplayDescription(tx, language) ? (
                      <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{getDisplayDescription(tx, language)}</p>
                    ) : null}
                    {metadataEntries.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                        <div className="font-semibold">{copy.details}</div>
                        {metadataEntries.map(([key, value]) => (
                          <div key={key} className="flex items-center gap-1">
                            <span className="uppercase text-[10px] tracking-wide text-gray-500 dark:text-gray-500">{getMetadataLabel(key, copy)}</span>
                            <span className="font-medium text-gray-700 dark:text-gray-200">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={loading || page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {copy.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => (history ? Math.min(prev + 1, totalPages) : prev + 1))}
              disabled={loading || page >= totalPages}
            >
              {copy.next}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <div className="pt-3 text-center text-xs text-gray-500 dark:text-gray-400">
            <span className="uppercase tracking-wide text-[11px] text-gray-400 dark:text-gray-500">{copy.journey}</span>
            <span className="mx-1 text-gray-400 dark:text-gray-500">•</span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">{currentPage}</span>
            <span className="mx-1 text-gray-400 dark:text-gray-500">{copy.of}</span>
            <span className="font-semibold text-gray-700 dark:text-gray-200">{totalPages}</span>
          </div>
          {!!error && (
            <div className="text-xs text-rose-600 dark:text-rose-300">
              {copy.failedToLoad} {copy.failedToLoadHint}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
