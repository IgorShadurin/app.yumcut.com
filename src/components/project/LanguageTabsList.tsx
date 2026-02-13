"use client";

import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLanguageFlag } from '@/shared/constants/languages';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/common/Tooltip';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type LanguageTabItem = {
  languageCode: string;
  ready?: boolean;
  status?: 'ready' | 'processing' | 'error';
  tooltip?: string | null;
};

type LanguageTabsListProps = {
  items: LanguageTabItem[];
  listClassName?: string;
  triggerClassName?: string;
};

export function LanguageTabsList({ items, listClassName, triggerClassName }: LanguageTabsListProps) {
  return (
    <TabsList className={cn('bg-transparent p-0 gap-1 flex-wrap', listClassName)}>
      {items.map((item) => (
        <TabsTrigger
          key={item.languageCode}
          value={item.languageCode}
          className={cn('px-3 py-1.5 text-sm data-[state=active]:bg-primary/10', triggerClassName)}
        >
          <span className="flex items-center gap-1.5">
            <span>{getLanguageFlag(item.languageCode)}</span>
            <span>{item.languageCode.toUpperCase()}</span>
            <StatusIcon
              status={item.status ?? (item.ready ? 'ready' : 'processing')}
              tooltip={item.tooltip}
            />
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

type StatusIconProps = {
  status: 'ready' | 'processing' | 'error';
  tooltip?: string | null;
};

const COPY: Record<AppLanguageCode, { ready: string; failed: string; processing: string }> = {
  en: {
    ready: 'Ready',
    failed: 'Failed',
    processing: 'Processing',
  },
  ru: {
    ready: 'Готово',
    failed: 'Ошибка',
    processing: 'В процессе',
  },
};

function StatusIcon({ status, tooltip }: StatusIconProps) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const icon = (() => {
    switch (status) {
      case 'ready':
        return (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            <span className="sr-only">{copy.ready}</span>
          </>
        );
      case 'error':
        return (
          <>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
            <span className="sr-only">{copy.failed}</span>
          </>
        );
      default:
        return (
          <>
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">{copy.processing}</span>
          </>
        );
    }
  })();

  const iconWrapper = (
    <span className="flex items-center">{icon}</span>
  );

  if (!tooltip) return iconWrapper;

  return (
    <Tooltip content={tooltip}>
      <span className="flex items-center">{icon}</span>
    </Tooltip>
  );
}
