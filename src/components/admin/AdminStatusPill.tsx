"use client";

import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/common/Tooltip';
import { ProjectStatus } from '@/shared/constants/status';
import { statusLabel, statusDescription } from '@/shared/constants/status-info';
import { CheckCircle2, AlertCircle, Headphones, Edit3, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  status: ProjectStatus;
};

function getVariant(status: ProjectStatus): 'info' | 'success' | 'danger' | 'default' {
  switch (status) {
    case ProjectStatus.Done:
      return 'success';
    case ProjectStatus.Error:
      return 'danger';
    case ProjectStatus.ProcessScriptValidate:
    case ProjectStatus.ProcessAudioValidate:
      return 'info';
    default:
      return 'default';
  }
}

function getIcon(status: ProjectStatus) {
  switch (status) {
    case ProjectStatus.Done:
      return { Icon: CheckCircle2, className: 'text-emerald-500' };
    case ProjectStatus.Error:
      return { Icon: AlertCircle, className: 'text-rose-500' };
    case ProjectStatus.ProcessAudioValidate:
      return { Icon: Headphones, className: 'text-sky-500' };
    case ProjectStatus.ProcessScriptValidate:
      return { Icon: Edit3, className: 'text-indigo-500' };
    default:
      return { Icon: Clock, className: 'text-slate-500' };
  }
}

export function AdminStatusPill({ status }: Props) {
  const label = statusLabel(status);
  const description = statusDescription(status);
  const variant = getVariant(status);
  const { Icon, className } = getIcon(status);

  return (
    <Tooltip content={description}>
      <div className="shrink-0">
        <Badge
          variant={variant}
          size="icon"
          className={cn(
            'rounded-full',
            variant === 'default' && 'border-gray-200 bg-white text-gray-500 dark:border-gray-800 dark:bg-gray-950'
          )}
          aria-label={label}
          data-variant={variant}
        >
          <Icon className={cn('h-3.5 w-3.5', className)} aria-hidden="true" />
        </Badge>
      </div>
    </Tooltip>
  );
}
