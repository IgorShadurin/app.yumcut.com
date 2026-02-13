import { useEffect, useState, useCallback } from 'react';
import { Api } from '@/lib/api-client';
import type { UserSettingsDTO } from '@/shared/types';
import { useSettingsContext } from '@/components/providers/SettingsProvider';

const STORAGE_KEY = 'userSettings';

export function useSettings() {
  const ctx = useSettingsContext();
  const [local, setLocal] = useState<UserSettingsDTO | null>(ctx?.settings ?? null);
  const [loading, setLoading] = useState(!ctx?.settings);
  const [error, setError] = useState<any>(null);

  // Keep local mirror in sync with context
  useEffect(() => {
    if (ctx?.settings) {
      setLocal(ctx.settings);
      setLoading(false);
    }
  }, [ctx?.settings]);

  // Load settings from API if provider didn't have them yet
  useEffect(() => {
    if (ctx?.settings) return;
    Api.getSettings()
      .then((r: UserSettingsDTO) => {
        setLocal(r);
        ctx?.setSettings?.(r);
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
          }
        } catch (e) {
          // ignore localStorage errors
        }
      })
      .catch(setError)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optimistic update: update UI immediately, persist in background
  const update = useCallback(
    (key: keyof UserSettingsDTO, value: UserSettingsDTO[typeof key]) => {
      const current = (ctx?.settings ?? local);
      if (!current) return Promise.resolve(null);

      const prevValue = current[key] as UserSettingsDTO[typeof key];

      // Optimistically update shared context and local mirror
      const optimistic: UserSettingsDTO = { ...current, [key]: value } as UserSettingsDTO;
      ctx?.setSettings?.(optimistic);
      setLocal(optimistic);

      // Persist optimistic value to localStorage right away
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(optimistic));
        }
      } catch (e) {
        // ignore localStorage errors
      }

      // Fire-and-forget server update; reconcile on success, revert on failure
      return Api.patchSetting(key as any, value as any)
        .then((server: Partial<UserSettingsDTO>) => {
          ctx?.setSettings?.((prev) => (prev ? ({ ...prev, ...server } as UserSettingsDTO) : prev));
          setLocal((prev) => (prev ? ({ ...prev, ...server } as UserSettingsDTO) : prev));
          try {
            if (typeof window !== 'undefined') {
              const existing = window.localStorage.getItem(STORAGE_KEY);
              const merged = existing
                ? { ...(JSON.parse(existing) as UserSettingsDTO), ...server }
                : (server as UserSettingsDTO);
              // Clean up any legacy keys that might linger
              if ((merged as any).sidebarOpenMain !== undefined) delete (merged as any).sidebarOpenMain;
              if ((merged as any).sidebarOpenProject !== undefined) delete (merged as any).sidebarOpenProject;
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            }
          } catch (e) {
            // ignore localStorage errors
          }
          return server;
        })
        .catch((err) => {
          // Revert the single key to previous value
          ctx?.setSettings?.((prev) => (prev ? ({ ...prev, [key]: prevValue } as UserSettingsDTO) : prev));
          setLocal((prev) => (prev ? ({ ...prev, [key]: prevValue } as UserSettingsDTO) : prev));
          try {
            if (typeof window !== 'undefined') {
              const currentNow = (optimistic ?? current) as UserSettingsDTO;
              const reverted = { ...currentNow, [key]: prevValue } as UserSettingsDTO;
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reverted));
            }
          } catch (e) {
            // ignore localStorage errors
          }
          // Surface error to callers if they care
          throw err;
        });
    },
    [ctx?.settings, local]
  );

  return { settings: ctx?.settings ?? local, loading, error, update };
}
