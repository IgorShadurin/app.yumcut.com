'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SummaryStat } from '@/components/admin/token-pricing/SummaryStat';
import { ChartLine, Settings2 } from 'lucide-react';
import { ComponentMeta, ComputedCostItem } from '@/components/admin/token-pricing/types';
import { USD } from '@/components/admin/token-pricing/formatters';

export type PricingSnapshotSectionProps = {
  costPerVideo: number;
  costPerToken: number;
  targetPerVideo: number;
  targetPerToken: number;
  multiplier: number;
  tokensPerUnit: number;
  costBreakdown: ComputedCostItem[];
  componentMeta: Record<string, ComponentMeta>;
};

export function PricingSnapshotSection({
  costPerVideo,
  costPerToken,
  targetPerVideo,
  targetPerToken,
  multiplier,
  tokensPerUnit,
  costBreakdown,
  componentMeta,
}: PricingSnapshotSectionProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ChartLine className="h-5 w-5 text-emerald-500" />
            <CardTitle>Pricing snapshot (per minute)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Before (cost basis)</h3>
              <SummaryStat label="Cost per video" value={USD.format(costPerVideo)} />
              <SummaryStat label="Cost per token" value={USD.format(costPerToken)} />
            </div>

            <Separator orientation="horizontal" className="md:hidden" />
            <Separator orientation="vertical" className="hidden h-full md:block" />

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">After (multiplied)</h3>
              <SummaryStat label="Target per video" value={USD.format(targetPerVideo)} />
              <SummaryStat label="Target per token" value={USD.format(targetPerToken)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-amber-500" />
            <CardTitle>Component cost ranking</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {costBreakdown.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No cost components selected.</p>
          ) : (
            <ul className="space-y-2">
              {costBreakdown.map((item) => {
                const meta = componentMeta[item.id];
                const Icon = meta?.icon;
                const colorClass = meta?.colorClass ?? 'text-gray-500';
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                      {Icon ? <Icon className={`h-4 w-4 ${colorClass}`} /> : null}
                      {item.label}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{USD.format(item.total)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
