'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, Coins, CreditCard, Loader2, RefreshCcw, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Api } from '@/lib/api-client';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';
import type { SubscriptionStatusDTO } from '@/shared/types';
import { requestTokenRefresh } from '@/hooks/useTokenSummary';
import { formatDateTime } from '@/lib/date';
import { formatSubscriptionVideoCountForPaywall, type SubscriptionPlanKey } from '@/shared/constants/subscriptions';
import type { TokenTopUpPackage, TokenTopUpPackageKey } from '@/shared/constants/token-topups';

type SubscriptionCardCopy = {
  title: string;
  description: string;
  statusActive: string;
  statusInactive: string;
  statusCancelsAtPeriodEnd: string;
  statusActiveUntil: string;
  expiresAt: string;
  currentPlan: string;
  planTokens: (tokens: number) => string;
  planImages: (images: string, interval: 'week' | 'month') => string;
  planVideos: (videos: string, interval: 'week' | 'month') => string;
  per: {
    week: string;
    month: string;
  };
  startPlan: string;
  currentPlanButton: string;
  manageBilling: string;
  refreshing: string;
  refresh: string;
  checkoutCreating: string;
  portalOpening: string;
  checkoutSuccess: string;
  checkoutCancelled: string;
  checkoutError: string;
  portalError: string;
  notConfigured: string;
  topUpTitle: string;
  topUpDescription: string;
  topUpPackageLabel: string;
  topUpOption: (tokens: number, priceUsd: number) => string;
  topUpAction: string;
  topUpCreating: string;
  topUpPaymentReceived: string;
  topUpSuccess: (tokens: number) => string;
  topUpCancelled: string;
  topUpPending: string;
  topUpError: string;
  topUpNotConfigured: string;
};

const COPY: Record<AppLanguageCode, SubscriptionCardCopy> = {
  en: {
    title: 'Subscription plans',
    description: 'Choose a recurring plan to auto-credit tokens after each successful charge.',
    statusActive: 'Subscription active',
    statusInactive: 'No active subscription',
    statusCancelsAtPeriodEnd: 'Cancellation scheduled',
    statusActiveUntil: 'Active until',
    expiresAt: 'Current period ends',
    currentPlan: 'Current plan',
    planTokens: (tokens) => `${tokens.toLocaleString()} tokens per charge`,
    planImages: (images, interval) => `${images} images/${interval}`,
    planVideos: (videos, interval) => `${videos} videos/${interval}`,
    per: {
      week: 'week',
      month: 'month',
    },
    startPlan: 'Choose plan',
    currentPlanButton: 'Current plan',
    manageBilling: 'Manage billing',
    refreshing: 'Refreshing…',
    refresh: 'Refresh',
    checkoutCreating: 'Opening checkout…',
    portalOpening: 'Opening billing portal…',
    checkoutSuccess: 'Payment completed. Tokens will be credited automatically after successful charge.',
    checkoutCancelled: 'Checkout cancelled.',
    checkoutError: 'Failed to start checkout.',
    portalError: 'Failed to open billing portal.',
    notConfigured: 'Stripe billing is not configured yet.',
    topUpTitle: 'Top up balance',
    topUpDescription: 'Buy a one-time token package. No subscription is created.',
    topUpPackageLabel: 'Token package',
    topUpOption: (tokens, priceUsd) => `${tokens.toLocaleString()} tokens — $${priceUsd.toFixed(2)}`,
    topUpAction: 'Buy tokens',
    topUpCreating: 'Opening checkout…',
    topUpPaymentReceived: 'Payment received. Crediting tokens…',
    topUpSuccess: (tokens) => `${tokens.toLocaleString()} tokens were added to your balance.`,
    topUpCancelled: 'Token purchase cancelled.',
    topUpPending: 'Payment succeeded. Tokens are still being credited; refresh shortly if the balance has not updated.',
    topUpError: 'Failed to start token purchase.',
    topUpNotConfigured: 'One-time token purchases are not configured yet.',
  },
  ru: {
    title: 'Планы подписки',
    description: 'Выберите регулярный план, чтобы токены начислялись автоматически после каждого успешного списания.',
    statusActive: 'Подписка активна',
    statusInactive: 'Активной подписки нет',
    statusCancelsAtPeriodEnd: 'Отмена запланирована',
    statusActiveUntil: 'Активна до',
    expiresAt: 'Текущий период до',
    currentPlan: 'Текущий план',
    planTokens: (tokens) => `${tokens.toLocaleString()} токенов за списание`,
    planImages: (images, interval) => `${images} изображений/${interval === 'week' ? 'неделя' : 'месяц'}`,
    planVideos: (videos, interval) => `${videos} видео/${interval === 'week' ? 'неделя' : 'месяц'}`,
    per: {
      week: 'неделю',
      month: 'месяц',
    },
    startPlan: 'Выбрать план',
    currentPlanButton: 'Текущий план',
    manageBilling: 'Управление оплатой',
    refreshing: 'Обновляем…',
    refresh: 'Обновить',
    checkoutCreating: 'Открываем оплату…',
    portalOpening: 'Открываем billing portal…',
    checkoutSuccess: 'Оплата завершена. Токены начислятся автоматически после успешного списания.',
    checkoutCancelled: 'Оплата отменена.',
    checkoutError: 'Не удалось запустить оплату.',
    portalError: 'Не удалось открыть billing portal.',
    notConfigured: 'Stripe-подписки пока не настроены.',
    topUpTitle: 'Пополнить баланс',
    topUpDescription: 'Купите пакет токенов одним платежом. Подписка не оформляется.',
    topUpPackageLabel: 'Пакет токенов',
    topUpOption: (tokens, priceUsd) => `${tokens.toLocaleString()} токенов — $${priceUsd.toFixed(2)}`,
    topUpAction: 'Купить токены',
    topUpCreating: 'Открываем оплату…',
    topUpPaymentReceived: 'Платёж получен. Начисляем токены…',
    topUpSuccess: (tokens) => `${tokens.toLocaleString()} токенов добавлено на баланс.`,
    topUpCancelled: 'Покупка токенов отменена.',
    topUpPending: 'Платёж прошёл. Токены ещё начисляются; обновите страницу немного позже, если баланс не изменился.',
    topUpError: 'Не удалось начать покупку токенов.',
    topUpNotConfigured: 'Разовые покупки токенов пока не настроены.',
  },
};

function formatPeriodDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  try {
    return formatDateTime(value);
  } catch {
    return value;
  }
}

type TokenTopUpPackageUi = TokenTopUpPackage & { configured: boolean };

export function SubscriptionPlansCard({
  initialStatus,
  topUpPackages,
}: {
  initialStatus: SubscriptionStatusDTO;
  topUpPackages: TokenTopUpPackageUi[];
}) {
  const { language } = useAppLanguage();
  const t = COPY[language];
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<SubscriptionStatusDTO>(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanKey | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [selectedTopUp, setSelectedTopUp] = useState<TokenTopUpPackageKey>(
    topUpPackages.find((tokenPackage) => tokenPackage.configured)?.key ?? topUpPackages[0]?.key ?? 'starter',
  );
  const [openingTopUp, setOpeningTopUp] = useState(false);

  const activeProductId = status.active ? status.productId : null;
  const activePlan = useMemo(
    () => status.plans.find((plan) => plan.productId === activeProductId) ?? null,
    [status.plans, activeProductId],
  );

  const fetchStatus = useCallback(async () => {
    const nextStatus = await Api.getSubscriptionStatus();
    setStatus(nextStatus);
    requestTokenRefresh();
    return nextStatus;
  }, []);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStatus();
    } catch (error) {
      void error;
    } finally {
      setRefreshing(false);
    }
  }, [fetchStatus]);

  const startCheckout = async (plan: SubscriptionPlanKey) => {
    setCheckoutPlan(plan);
    try {
      const result = await Api.createSubscriptionCheckout(plan);
      if (result.action === 'checkout') {
        window.location.href = result.url;
      } else if (result.action === 'already_on_plan') {
        toast.info(t.currentPlanButton);
      } else {
        toast.success(t.checkoutSuccess);
        await fetchStatus();
      }
    } catch (error) {
      toast.error(t.checkoutError);
      void error;
    } finally {
      setCheckoutPlan(null);
    }
  };

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const { url } = await Api.createSubscriptionPortal();
      window.location.href = url;
    } catch (error) {
      toast.error(t.portalError);
      void error;
    } finally {
      setOpeningPortal(false);
    }
  };

  const startTopUpCheckout = async () => {
    setOpeningTopUp(true);
    try {
      const result = await Api.createTokenTopUpCheckout(selectedTopUp);
      window.location.href = result.url;
    } catch (error) {
      toast.error(t.topUpError);
      void error;
    } finally {
      setOpeningTopUp(false);
    }
  };

  useEffect(() => {
    const billingState = searchParams.get('billing');
    const hasSessionId = Boolean(searchParams.get('session_id'));
    if (!billingState && !hasSessionId) return;

    const shouldSyncAfterRedirect = billingState === 'success' || hasSessionId;
    if (billingState === 'success') {
      toast.success(t.checkoutSuccess);
    } else if (billingState === 'cancelled') {
      toast.info(t.checkoutCancelled);
    }

    let cancelled = false;
    if (shouldSyncAfterRedirect) {
      void (async () => {
        const attempts = 8;
        for (let index = 0; index < attempts; index += 1) {
          if (cancelled) return;
          try {
            const next = await fetchStatus();
            if (next.active) return;
          } catch (error) {
            void error;
          }
          if (index < attempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      })();
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('billing');
    nextParams.delete('session_id');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });

    return () => {
      cancelled = true;
    };
  }, [searchParams, pathname, router, t.checkoutSuccess, t.checkoutCancelled, fetchStatus]);

  useEffect(() => {
    const topUpState = searchParams.get('topup');
    const checkoutSessionId = searchParams.get('topup_session_id');
    if (!topUpState && !checkoutSessionId) return;

    const clearTopUpParams = () => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete('topup');
      nextParams.delete('topup_session_id');
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    };

    if (topUpState === 'cancelled') {
      toast.info(t.topUpCancelled);
      clearTopUpParams();
    } else if (topUpState === 'success' || checkoutSessionId) {
      toast.success(t.topUpPaymentReceived);
    }

    let cancelled = false;
    if (checkoutSessionId && (topUpState === 'success' || !topUpState)) {
      void (async () => {
        try {
          for (let index = 0; index < 10; index += 1) {
            if (cancelled) return;
            try {
              const result = await Api.getTokenTopUpStatus(checkoutSessionId);
              if (result.status === 'credited') {
                toast.success(t.topUpSuccess(result.tokens));
                requestTokenRefresh();
                router.refresh();
                return;
              }
            } catch (error) {
              void error;
            }
            if (index < 9) await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          if (!cancelled) toast.info(t.topUpPending);
        } finally {
          if (!cancelled) clearTopUpParams();
        }
      })();
    } else if (topUpState !== 'cancelled') {
      clearTopUpParams();
    }

    return () => {
      cancelled = true;
    };
  }, [searchParams, pathname, router, t]);

  const selectedTopUpPackage = topUpPackages.find((tokenPackage) => tokenPackage.key === selectedTopUp);
  const topUpsConfigured = topUpPackages.length > 0 && topUpPackages.every((tokenPackage) => tokenPackage.configured);

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full items-start gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              <span>{t.title}</span>
            </CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </div>
          <Button
            className="ml-auto shrink-0 cursor-pointer"
            variant="outline"
            size="icon"
            onClick={() => void refreshStatus()}
            disabled={refreshing}
            aria-label={refreshing ? t.refreshing : t.refresh}
            title={refreshing ? t.refreshing : t.refresh}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-900/40">
          <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
            {status.active ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : <CalendarClock className="h-4 w-4" />}
            {status.active ? t.statusActive : t.statusInactive}
          </div>
          {status.active ? (
            <div className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
              {activePlan ? (
                <p>
                  {t.currentPlan}: <span className="font-medium text-gray-900 dark:text-gray-100">{activePlan.label}</span>
                </p>
              ) : null}
              <p>
                {t.expiresAt}:{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatPeriodDate(status.expiresAt, '—')}
                </span>
              </p>
              {status.cancelAtPeriodEnd ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                  <span className="font-medium">{t.statusCancelsAtPeriodEnd}.</span>{' '}
                  {t.statusActiveUntil}:{' '}
                  <span className="font-semibold">
                    {formatPeriodDate(status.cancellationEffectiveAt ?? status.expiresAt, '—')}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {!status.stripeReady ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/30 dark:text-yellow-100">
            {t.notConfigured}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {status.plans.map((plan) => {
              const isCurrent = status.active && plan.productId === activeProductId;
              const planPeriod = plan.interval === 'week' ? t.per.week : t.per.month;
              const isLoading = checkoutPlan === plan.planKey;
              return (
                <div
                  key={plan.planKey}
                  className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    ${plan.priceUsd.toFixed(2)} / {planPeriod}
                  </p>
                  <div className="mt-1 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                    {plan.benefits.map((benefit, index) => {
                      if (benefit.key === 'tokens_per_charge' && typeof benefit.tokens === 'number') {
                        return <p key={`${plan.planKey}-benefit-${index}`}>{t.planTokens(benefit.tokens)}</p>;
                      }
                      if (benefit.key === 'images_per_period' && typeof benefit.images === 'number' && benefit.interval) {
                        return <p key={`${plan.planKey}-benefit-${index}`}>{t.planImages(benefit.images.toLocaleString(), benefit.interval)}</p>;
                      }
                      if (benefit.key === 'videos_per_period' && typeof benefit.videos === 'number' && benefit.interval) {
                        return <p key={`${plan.planKey}-benefit-${index}`}>{t.planVideos(formatSubscriptionVideoCountForPaywall(benefit.videos), benefit.interval)}</p>;
                      }
                      return null;
                    })}
                  </div>
                  <Button
                    className="mt-3 w-full cursor-pointer"
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={isCurrent || isLoading || openingPortal || refreshing || !plan.configured}
                    onClick={() => void startCheckout(plan.planKey)}
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    {isCurrent ? t.currentPlanButton : isLoading ? t.checkoutCreating : t.startPlan}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {status.canManageBilling ? (
          <Button className="cursor-pointer" variant="outline" onClick={() => void openPortal()} disabled={openingPortal || checkoutPlan !== null}>
            {openingPortal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            {openingPortal ? t.portalOpening : t.manageBilling}
          </Button>
        ) : null}

        <Separator className="my-6" />

        <section aria-labelledby="token-top-up-title" className="space-y-3">
          <div className="space-y-1">
            <h3 id="token-top-up-title" className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
              <Coins className="h-5 w-5" />
              <span>{t.topUpTitle}</span>
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t.topUpDescription}</p>
          </div>

          {!topUpsConfigured ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/30 dark:text-yellow-100">
              {t.topUpNotConfigured}
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor="token-top-up-package" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t.topUpPackageLabel}
                </label>
                <Select value={selectedTopUp} onValueChange={(value) => setSelectedTopUp(value as TokenTopUpPackageKey)}>
                  <SelectTrigger id="token-top-up-package" className="cursor-pointer rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {topUpPackages.map((tokenPackage) => (
                      <SelectItem className="cursor-pointer" key={tokenPackage.key} value={tokenPackage.key}>
                        {t.topUpOption(tokenPackage.tokens, tokenPackage.priceUsd)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="cursor-pointer sm:min-w-40"
                disabled={openingTopUp || !selectedTopUpPackage?.configured}
                onClick={() => void startTopUpCheckout()}
              >
                {openingTopUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                {openingTopUp ? t.topUpCreating : t.topUpAction}
              </Button>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
