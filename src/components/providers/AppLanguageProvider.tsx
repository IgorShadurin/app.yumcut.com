"use client";

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  APP_LANGUAGE_STORAGE_KEY,
  DEFAULT_APP_LANGUAGE,
  type AppLanguageCode,
  parseAppLanguage,
} from '@/shared/constants/app-language';

type AppLanguageContextValue = {
  language: AppLanguageCode;
  setLanguage: (next: AppLanguageCode) => void;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

function readStoredLanguage(): AppLanguageCode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function AppLanguageProvider({
  children,
  initialLanguage,
  allowStoredOverride,
}: {
  children: React.ReactNode;
  initialLanguage: AppLanguageCode;
  allowStoredOverride: boolean;
}) {
  const [language, setLanguage] = useState<AppLanguageCode>(initialLanguage ?? DEFAULT_APP_LANGUAGE);

  useEffect(() => {
    if (allowStoredOverride) return;
    setLanguage(initialLanguage ?? DEFAULT_APP_LANGUAGE);
  }, [allowStoredOverride, initialLanguage]);

  useEffect(() => {
    const queryLanguage = typeof window !== 'undefined'
      ? parseAppLanguage(new URLSearchParams(window.location.search).get('lang'))
      : null;
    if (queryLanguage) {
      setLanguage(queryLanguage);
      return;
    }
    if (!allowStoredOverride) return;
    const stored = readStoredLanguage();
    if (stored) {
      setLanguage(stored);
    }
  }, [allowStoredOverride]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [language]);

  const value = useMemo<AppLanguageContextValue>(() => ({ language, setLanguage }), [language]);

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useAppLanguage() {
  const ctx = useContext(AppLanguageContext);
  if (!ctx) {
    throw new Error('useAppLanguage must be used within AppLanguageProvider');
  }
  return ctx;
}
