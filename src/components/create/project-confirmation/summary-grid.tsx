import { Tooltip } from '@/components/common/Tooltip';
import { cn } from '@/lib/utils';
import type { SummaryItem } from './types';

type SummaryGridProps = {
  items: SummaryItem[];
};

export function SummaryGrid({ items }: SummaryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <Tooltip key={item.key} content={item.tooltip}>
          <div
            className={cn(
              'flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-center text-xs font-medium text-gray-700 transition dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200',
              item.containerClass,
              item.warning && 'border-rose-300 dark:border-rose-500/60',
            )}
          >
            {item.render ? (
              <div className={cn(item.renderClass, item.iconClass)}>{item.render}</div>
            ) : (
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-full text-base', item.iconClass)}>
                {item.emoji ? (
                  <span className="text-lg leading-none">{item.emoji}</span>
                ) : item.icon ? (
                  <item.icon className="h-5 w-5" />
                ) : null}
              </div>
            )}
            {item.badge ? <span className="leading-tight">{item.badge}</span> : null}
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
