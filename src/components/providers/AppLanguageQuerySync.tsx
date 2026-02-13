"use client";

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Api } from '@/lib/api-client';
import {
  APP_LANGUAGE_PENDING_AUTH_STORAGE_KEY,
  parseAppLanguage,
  type AppLanguageCode,
} from '@/shared/constants/app-language';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';

function readPendingAuthLanguage(): AppLanguageCode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseAppLanguage(window.localStorage.getItem(APP_LANGUAGE_PENDING_AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writePendingAuthLanguage(language: AppLanguageCode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_LANGUAGE_PENDING_AUTH_STORAGE_KEY, language);
  } catch {
    // Ignore localStorage write errors.
  }
}

function clearPendingAuthLanguage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(APP_LANGUAGE_PENDING_AUTH_STORAGE_KEY);
  } catch {
    // Ignore localStorage write errors.
  }
}

export function AppLanguageQuerySync() {
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { language, setLanguage } = useAppLanguage();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    const fromQuery = parseAppLanguage(searchParams.get('lang'));
    if (fromQuery) {
      if (fromQuery !== language) {
        setLanguage(fromQuery);
      }
      writePendingAuthLanguage(fromQuery);
    }

    const pendingLanguage = readPendingAuthLanguage();
    const targetLanguage = fromQuery ?? pendingLanguage;

    if (!targetLanguage) return;

    if (targetLanguage !== language) {
      setLanguage(targetLanguage);
    }

    if (status !== 'authenticated') return;
    if (lastSyncedRef.current === targetLanguage) return;

    lastSyncedRef.current = targetLanguage;
    Api.updateAccountLanguage(targetLanguage, { showErrorToast: false }).then(() => {
      clearPendingAuthLanguage();
    }).catch(() => {
      lastSyncedRef.current = null;
    });
  }, [language, searchParams, setLanguage, status]);

  return null;
}
