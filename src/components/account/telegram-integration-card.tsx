'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

interface TelegramAccountInfo {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedAt: string | null;
}

interface PendingLink {
  code: string;
  url: string | null;
  expiresAt: string;
}

interface Props {
  telegramEnabled: boolean;
  botUsername: string | null;
  initialAccount: TelegramAccountInfo | null;
}

type TelegramCardCopy = {
  unknown: string;
  toastLinkGeneratedTitle: string;
  toastLinkGeneratedDescription: string;
  toastDisconnected: string;
  toastCodeCopied: string;
  toastCopyFailed: string;
  title: string;
  disabledHint: string;
  connectedAs: string;
  telegramUserFallback: string;
  linkedOn: string;
  disconnectTelegram: string;
  disconnectDialogTitle: string;
  disconnectDialogDescription: string;
  cancel: string;
  disconnecting: string;
  disconnect: string;
  refreshing: string;
  refreshStatus: string;
  updatesHint: string;
  lookForPrefix: string;
  lookForSuffix: string;
  connecting: string;
  connectToTelegram: string;
  connectionCode: string;
  codeHelpPrefix: string;
  codeHelpSuffix: string;
  copyCode: string;
  openTelegram: string;
  securityTips: string;
  securityTip1: string;
  securityTip2: string;
  securityTip3: string;
};

const COPY: Record<AppLanguageCode, TelegramCardCopy> = {
  en: {
    unknown: 'Unknown',
    toastLinkGeneratedTitle: 'Telegram link generated',
    toastLinkGeneratedDescription: 'Open Telegram to complete the connection.',
    toastDisconnected: 'Telegram disconnected',
    toastCodeCopied: 'Code copied to clipboard',
    toastCopyFailed: 'Could not copy the code',
    title: 'Telegram notifications',
    disabledHint: 'Telegram integration is currently disabled for this environment. Existing connections can still be refreshed or disconnected, but new links cannot be generated until an administrator configures the bot.',
    connectedAs: 'Connected as',
    telegramUserFallback: 'Telegram user',
    linkedOn: 'Linked on',
    disconnectTelegram: 'Disconnect Telegram',
    disconnectDialogTitle: 'Disconnect Telegram?',
    disconnectDialogDescription: 'This will stop YumCut from sending any updates to your chat until you reconnect.',
    cancel: 'Cancel',
    disconnecting: 'Disconnecting…',
    disconnect: 'Disconnect',
    refreshing: 'Refreshing…',
    refreshStatus: 'Refresh status',
    updatesHint: 'Receive real-time updates in Telegram when your projects need approval, finish processing, or hit an error.',
    lookForPrefix: 'Look for',
    lookForSuffix: 'in Telegram after generating a link below.',
    connecting: 'Connecting…',
    connectToTelegram: 'Connect to Telegram',
    connectionCode: 'Connection code',
    codeHelpPrefix: 'Use this code in Telegram if the deep link does not open automatically. The code expires on',
    codeHelpSuffix: '.',
    copyCode: 'Copy code',
    openTelegram: 'Open Telegram',
    securityTips: 'Security tips',
    securityTip1: 'Connection codes expire after 10 minutes and can only be used once.',
    securityTip2: 'You can disconnect at any time from here or by sending /stop to the bot.',
    securityTip3: 'We never store your Telegram access token; only your chat identifier is kept.',
  },
  ru: {
    unknown: 'Неизвестно',
    toastLinkGeneratedTitle: 'Ссылка для Telegram создана',
    toastLinkGeneratedDescription: 'Откройте Telegram, чтобы завершить подключение.',
    toastDisconnected: 'Telegram отключен',
    toastCodeCopied: 'Код скопирован',
    toastCopyFailed: 'Не удалось скопировать код',
    title: 'Уведомления в Telegram',
    disabledHint: 'Интеграция Telegram сейчас отключена для этого окружения. Существующие подключения можно обновлять или отключать, но новые ссылки недоступны, пока администратор не настроит бота.',
    connectedAs: 'Подключено как',
    telegramUserFallback: 'Пользователь Telegram',
    linkedOn: 'Подключено',
    disconnectTelegram: 'Отключить Telegram',
    disconnectDialogTitle: 'Отключить Telegram?',
    disconnectDialogDescription: 'ЯмКат перестанет отправлять обновления в ваш чат, пока вы не подключите Telegram снова.',
    cancel: 'Отмена',
    disconnecting: 'Отключаем…',
    disconnect: 'Отключить',
    refreshing: 'Обновляем…',
    refreshStatus: 'Обновить статус',
    updatesHint: 'Получайте уведомления в Telegram, когда проект требует подтверждения, завершился или завершился с ошибкой.',
    lookForPrefix: 'Найдите',
    lookForSuffix: 'в Telegram после генерации ссылки ниже.',
    connecting: 'Подключаем…',
    connectToTelegram: 'Подключить Telegram',
    connectionCode: 'Код подключения',
    codeHelpPrefix: 'Используйте этот код в Telegram, если глубокая ссылка не открылась автоматически. Код действует до',
    codeHelpSuffix: '.',
    copyCode: 'Скопировать код',
    openTelegram: 'Открыть Telegram',
    securityTips: 'Советы по безопасности',
    securityTip1: 'Код подключения действует 10 минут и может быть использован только один раз.',
    securityTip2: 'Вы можете отключиться в любой момент здесь или отправив /stop боту.',
    securityTip3: 'Мы не храним ваш Telegram access token; сохраняется только идентификатор чата.',
  },
};

export function TelegramIntegrationCard({ telegramEnabled, botUsername, initialAccount }: Props) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const [account, setAccount] = useState<TelegramAccountInfo | null>(initialAccount);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [enabled, setEnabled] = useState(telegramEnabled);
  const refreshInFlight = useRef(false);
  const mountedRef = useRef(true);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const botHandle = useMemo(() => {
    if (!botUsername) return null;
    return botUsername.startsWith('@') ? botUsername : `@${botUsername}`;
  }, [botUsername]);

  const linkedLabel = useMemo(() => {
    if (!account?.linkedAt) return copy.unknown;
    try {
      return formatDateTime(account.linkedAt);
    } catch {
      return account.linkedAt;
    }
  }, [account?.linkedAt, copy.unknown]);

  async function handleGenerateLink() {
    setLoading(true);
    try {
      const token = await Api.createTelegramLinkToken();
      setPendingLink({ code: token.code, url: token.deepLinkUrl ?? null, expiresAt: token.expiresAt });
      toast.success(copy.toastLinkGeneratedTitle, { description: copy.toastLinkGeneratedDescription });
      if (token.deepLinkUrl) {
        window.open(token.deepLinkUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const refreshStatus = useCallback(
    async (manual = false) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const result = await Api.getTelegramAccount();
        if (!mountedRef.current) return;
        setEnabled(Boolean(result.enabled));
        if (result.connected && result.account) {
          setAccount(result.account);
          setPendingLink(null);
        } else {
          setAccount(null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        refreshInFlight.current = false;
        if (manual) setRefreshing(false);
      }
    },
    [],
  );

  function handleRefresh() {
    void refreshStatus(true);
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await Api.disconnectTelegramAccount();
      setAccount(null);
      setPendingLink(null);
      toast.success(copy.toastDisconnected);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setDisconnectDialogOpen(false);
    }
  }

  async function handleCopy() {
    if (!pendingLink) return;
    try {
      await navigator.clipboard.writeText(pendingLink.code);
      toast.success(copy.toastCodeCopied);
    } catch (err) {
      console.error(err);
      toast.error(copy.toastCopyFailed);
    }
  }

  const expiresLabel = useMemo(() => {
    if (!pendingLink) return null;
    try {
      return formatDateTime(pendingLink.expiresAt);
    } catch {
      return pendingLink.expiresAt;
    }
  }, [pendingLink]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshStatus(false);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshStatus]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!enabled && (
          <p className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/40 dark:text-yellow-100">
            {copy.disabledHint}
          </p>
        )}
        {account ? (
          <div className="space-y-3">
            <p className="text-gray-600 dark:text-gray-300">
              {copy.connectedAs}{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {account.username ? `@${account.username}` : account.firstName || copy.telegramUserFallback}
              </span>
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              {copy.linkedOn}{' '}
              <span className="font-medium text-gray-900 dark:text-gray-100">{linkedLabel}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Dialog open={disconnectDialogOpen} onOpenChange={(open) => {
                if (loading) return;
                setDisconnectDialogOpen(open);
              }}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={loading}>
                    {copy.disconnectTelegram}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{copy.disconnectDialogTitle}</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {copy.disconnectDialogDescription}
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="outline" disabled={loading}>
                        {copy.cancel}
                      </Button>
                    </DialogClose>
                    <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
                      {loading ? copy.disconnecting : copy.disconnect}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
                {refreshing ? copy.refreshing : copy.refreshStatus}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-600 dark:text-gray-300">
              {copy.updatesHint}
            </p>
            {botHandle && (
              <p className="text-gray-600 dark:text-gray-300">
                {copy.lookForPrefix}{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">{botHandle}</span>{' '}
                {copy.lookForSuffix}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGenerateLink} disabled={loading || !enabled}>
                <Send className="mr-2 h-4 w-4" />
                {loading ? copy.connecting : copy.connectToTelegram}
              </Button>
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
                {refreshing ? copy.refreshing : copy.refreshStatus}
              </Button>
            </div>
            {pendingLink && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                <p className="font-medium text-gray-800 dark:text-gray-100">{copy.connectionCode}</p>
                <p className="mt-1">
                  {copy.codeHelpPrefix} <span className="font-semibold">{expiresLabel}</span>{copy.codeHelpSuffix}
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input value={pendingLink.code} readOnly className="font-mono" />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleCopy}>
                      {copy.copyCode}
                    </Button>
                    {pendingLink.url && enabled && (
                      <Button asChild>
                        <a href={pendingLink.url} target="_blank" rel="noopener noreferrer">
                          {copy.openTelegram}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <Separator />
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-700 dark:text-gray-200">{copy.securityTips}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>{copy.securityTip1}</li>
            <li>{copy.securityTip2}</li>
            <li>{copy.securityTip3}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
