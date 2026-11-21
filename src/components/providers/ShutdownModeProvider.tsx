'use client';

import { createContext, useContext } from 'react';
import { useSession } from 'next-auth/react';
import { CalendarClock } from 'lucide-react';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ShutdownDate = createContext<string | null>(null);
export const ShutdownModeProvider = ShutdownDate.Provider;
export const useShutdownDate = () => useContext(ShutdownDate);

export function ShutdownNotice() {
  const shutdownDate = useShutdownDate();
  const { status } = useSession();
  const { language } = useAppLanguage();
  if (!shutdownDate || status !== 'authenticated') return null;

  const dateLabel = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    dateStyle: 'long', timeZone: 'UTC',
  }).format(new Date(shutdownDate + 'T00:00:00Z'));

  return (
    <aside className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
      <p>
        {language === 'ru' ? 'YumCut завершает работу. Последний день доступа — ' : 'YumCut is shutting down. Your last day of access is '}
        <time className="font-semibold" dateTime={shutdownDate}>{dateLabel}</time>.
      </p>
    </aside>
  );
}

export function SignupNotice({ children }: { children: React.ReactNode }) {
  const shutdownDate = useShutdownDate();
  const { language } = useAppLanguage();
  if (!shutdownDate) return children;
  return language === 'ru'
    ? 'Регистрация в YumCut закрыта. Если у вас уже есть аккаунт, войдите через Google или Apple.'
    : 'YumCut is no longer accepting new signups. If you already have an account, sign in with Google or Apple.';
}

export function BalanceNotice({ cost, balance }: { cost: number; balance: number }) {
  const { language } = useAppLanguage();
  return language === 'ru'
    ? `Стоимость проекта — ${cost} токенов. Ваш баланс — ${balance}. Покупка токенов закрыта.`
    : `This project needs ${cost} tokens. Your balance is ${balance}. Token purchases are closed.`;
}

export function PaywallDialog({ cost, balance, open, onOpenChange, children }: {
  cost: number;
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const shutdownDate = useShutdownDate();
  const { language } = useAppLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {shutdownDate ? (
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'ru' ? 'Недостаточно токенов' : 'Insufficient tokens'}</DialogTitle>
          </DialogHeader>
          <DialogDescription><BalanceNotice cost={cost} balance={balance} /></DialogDescription>
        </DialogContent>
      ) : children}
    </Dialog>
  );
}
