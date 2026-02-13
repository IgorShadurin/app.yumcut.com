"use client";
import Link from 'next/link';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
import type { ProjectStatus } from '@/shared/constants/status';

type Props = {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAtLabel: string;
  userDisplay: string;
};

export function AdminProjectCardMobile({ id, title, status, createdAtLabel, userDisplay }: Props) {
  return (
    <Link
      href={`/admin/projects/${id}`}
      className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950 dark:hover:border-gray-700"
    >
      <div className="min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{title}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">Status</span>
        <AdminStatusPill status={status} />
      </div>
      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Created {createdAtLabel}</div>
      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 break-words">{userDisplay}</div>
    </Link>
  );
}

