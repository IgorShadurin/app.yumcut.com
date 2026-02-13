"use client";
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { ReactNode } from 'react';

export function SessionProviders({ children, session }: { children: ReactNode; session: Session | null }) {
  // NextAuth treats “session provided” as final state and will never refetch.
  // When there is no server session we must pass undefined so the client polls /api/auth/session.
  const normalizedSession = session ?? undefined;
  return <SessionProvider session={normalizedSession}>{children}</SessionProvider>;
}
