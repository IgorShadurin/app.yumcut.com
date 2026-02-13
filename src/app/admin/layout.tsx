import { ReactNode } from 'react';
import { requireAdminOrRedirect } from '@/server/admin';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminOrRedirect();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 py-2">
      {children}
    </div>
  );
}
