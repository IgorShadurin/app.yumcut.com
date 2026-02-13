"use client";
import { useEffect, useState, type ReactNode } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Api } from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';

const COPY = {
  en: {
    title: 'Sign in required',
    subtitle: 'Please sign in with Google or Apple to continue.',
    continueWithGoogle: 'Continue with Google',
    continueWithApple: 'Continue with Apple',
    signingIn: 'Signing in…',
  },
  ru: {
    title: 'Требуется вход',
    subtitle: 'Войдите через Google или Apple, чтобы продолжить.',
    continueWithGoogle: 'Войти с Google',
    continueWithApple: 'Войти с Apple',
    signingIn: 'Вход…',
  },
} as const;

export function AuthGate() {
  const { status } = useSession();
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const [show, setShow] = useState(false);
  const [startingProvider, setStartingProvider] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') setShow(true);
    else setShow(false);
  }, [status]);

  // If we appear authenticated but the DB was reset (user row missing),
  // force-clear the session so the next sign-in starts from scratch.
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (status !== 'authenticated') return;
      try {
        await Api.getSettings();
      } catch (e: any) {
        if (!cancelled && e?.status === 401) {
          await signOut({ redirect: false });
          setShow(true);
        }
      }
    }
    probe();
    return () => { cancelled = true; };
  }, [status]);

  if (!show) return null;

  return (
    <Dialog open={show} onOpenChange={() => { /* gate controls visibility */ }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {copy.subtitle}
        </p>
        <div className="mt-4 space-y-2">
          <AuthButton
            label={copy.continueWithGoogle}
            ariaLabel={copy.continueWithGoogle}
            icon={<Image src="/google.svg" alt="" width={18} height={18} className="mr-2" />}
            loading={startingProvider === 'google'}
            loadingLabel={copy.signingIn}
            disabled={!!startingProvider}
            onClick={() => {
              if (startingProvider) return;
              setStartingProvider('google');
              void signIn('google');
            }}
          />
          <AuthButton
            label={copy.continueWithApple}
            ariaLabel={copy.continueWithApple}
            icon={<Image src="/apple.svg" alt="" width={18} height={18} className="mr-2" />}
            loading={startingProvider === 'apple'}
            loadingLabel={copy.signingIn}
            disabled={!!startingProvider}
            onClick={() => {
              if (startingProvider) return;
              setStartingProvider('apple');
              void signIn('apple');
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

type AuthButtonProps = {
  label: string;
  ariaLabel: string;
  loading: boolean;
  loadingLabel: string;
  disabled: boolean;
  icon: ReactNode;
  onClick: () => void;
};

function AuthButton({ label, ariaLabel, loading, loadingLabel, disabled, icon, onClick }: AuthButtonProps) {
  return (
    <Button className="w-full flex items-center justify-center gap-2" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </Button>
  );
}
