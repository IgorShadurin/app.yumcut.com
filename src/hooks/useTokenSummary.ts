import { useCallback, useEffect, useMemo, useState } from 'react';
import { Api } from '@/lib/api-client';
import type { TokenSummaryDTO } from '@/shared/types';
import { useTokenContext } from '@/components/providers/TokenProvider';

export function useTokenSummary() {
  const ctx = useTokenContext();
  const contextSummary = ctx?.summary ?? null;
  const setSummary = ctx?.setSummary;
  const [local, setLocal] = useState<TokenSummaryDTO | null>(contextSummary);
  const [loading, setLoading] = useState(!contextSummary);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (contextSummary) {
      setLocal(contextSummary);
      setLoading(false);
    }
  }, [contextSummary]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await Api.getTokenSummary();
      setSummary?.(data);
      setLocal(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setSummary]);

  useEffect(() => {
    if (contextSummary) return;
    let cancelled = false;
    refresh().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contextSummary, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      refresh().catch(() => {});
    };
    window.addEventListener('tokens:refresh', handler);
    return () => window.removeEventListener('tokens:refresh', handler);
  }, [refresh]);

  const balance = local?.balance ?? 0;
  const summary = useMemo(() => local, [local]);

  return { summary, balance, loading, error, refresh, setSummary: ctx?.setSummary };
}

export function requestTokenRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tokens:refresh'));
}
