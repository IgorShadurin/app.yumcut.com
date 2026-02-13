import { getAuthSession } from './auth';
import { forbidden, unauthorized } from './http';
import { redirect } from 'next/navigation';

type SessionValue = Awaited<ReturnType<typeof getAuthSession>>;
type AdminApiSessionResult =
  | { session: NonNullable<SessionValue>; error: null }
  | { session: null; error: Response };
export function isAdminSession(session: SessionValue) {
  return !!session?.user && !!(session.user as any)?.id && !!(session.user as any)?.isAdmin;
}

export async function requireAdminOrRedirect() {
  const session = await getAuthSession();
  if (!isAdminSession(session)) {
    redirect('/');
  }
  return session!;
}

export async function requireAdminApiSession(): Promise<AdminApiSessionResult> {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) {
    return { session: null, error: unauthorized() };
  }
  if (!(session.user as any).isAdmin) {
    return { session: null, error: forbidden('Admin access required') };
  }
  return { session: session as NonNullable<SessionValue>, error: null };
}

export async function getAdminSession() {
  const session = await getAuthSession();
  return isAdminSession(session) ? (session as NonNullable<SessionValue>) : null;
}