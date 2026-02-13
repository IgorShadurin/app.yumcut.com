import { ReactNode } from 'react';

export type SummaryStatProps = {
  label: ReactNode;
  value: string;
  caption?: string;
  icon?: ReactNode;
};

export function SummaryStat({ label, value, caption }: SummaryStatProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-950/50">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      {caption ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{caption}</p> : null}
    </div>
  );
}
