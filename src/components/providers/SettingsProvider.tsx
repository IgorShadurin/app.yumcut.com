"use client";
import { createContext, useContext, useState } from 'react';
import type { UserSettingsDTO } from '@/shared/types';

type SettingsContextValue = {
  settings: UserSettingsDTO | null;
  setSettings: React.Dispatch<React.SetStateAction<UserSettingsDTO | null>>;
};

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ initial, children }: { initial: UserSettingsDTO | null; children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettingsDTO | null>(initial);
  return <SettingsContext.Provider value={{ settings, setSettings }}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext() {
  return useContext(SettingsContext);
}
