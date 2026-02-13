'use client';

import { useEffect } from 'react';
import { readUtmSourceCookie, UTM_SOURCE_COOKIE_NAME } from '@/shared/utm/helpers';

const COOKIE_DOMAIN = '.yumcut.com';
const MAX_UTM_LENGTH = 200;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function normalizeUtmSource(value: string) {
  return value.trim().slice(0, MAX_UTM_LENGTH);
}

function setUtmCookie(value: string) {
  try {
    document.cookie = `${UTM_SOURCE_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; domain=${COOKIE_DOMAIN}; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {}
}

function storeUtmSource(value: string) {
  const normalized = normalizeUtmSource(value);
  if (!normalized) return null;
  setUtmCookie(normalized);
  return normalized;
}

function getCookieValue(name: string) {
  try {
    const prefix = `${name}=`;
    const cookie = document.cookie.split('; ').find((entry) => entry.startsWith(prefix));
    return cookie ? cookie.slice(prefix.length) : null;
  } catch {
    return null;
  }
}

export function UtmSourceTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('utm_source');
    if (fromQuery) {
      storeUtmSource(fromQuery);
      return;
    }

    const existing = readUtmSourceCookie(getCookieValue(UTM_SOURCE_COOKIE_NAME));
    if (existing) {
      return;
    }
  }, []);

  return null;
}
