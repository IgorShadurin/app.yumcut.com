"use client";
import { createContext, useContext, useState } from 'react';
import type { TokenSummaryDTO } from '@/shared/types';

type TokenContextValue = {
  summary: TokenSummaryDTO | null;
  setSummary: React.Dispatch<React.SetStateAction<TokenSummaryDTO | null>>;
};

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ initial, children }: { initial: TokenSummaryDTO | null; children: React.ReactNode }) {
  const [summary, setSummary] = useState<TokenSummaryDTO | null>(initial);
  return <TokenContext.Provider value={{ summary, setSummary }}>{children}</TokenContext.Provider>;
}

export function useTokenContext() {
  return useContext(TokenContext);
}
