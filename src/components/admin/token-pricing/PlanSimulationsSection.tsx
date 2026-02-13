'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator } from 'lucide-react';
import { DECIMALS, USD, WHOLE } from '@/components/admin/token-pricing/formatters';
import { PlanSummary } from '@/components/admin/token-pricing/types';

export type PlanSimulationsSectionProps = {
  taxRatePercent: string;
  onTaxRateChange: (value: string) => void;
  planSummaries: PlanSummary[];
  planOverrides: Record<number, string>;
  globalMultiplier: string;
  onPlanMultiplierChange: (price: number, value: string) => void;
};

export function PlanSimulationsSection({
  taxRatePercent,
  onTaxRateChange,
  planSummaries,
  planOverrides,
  globalMultiplier,
  onPlanMultiplierChange,
}: PlanSimulationsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-violet-500" />
          <CardTitle>Plan simulations</CardTitle>
        </div>
        <CardDescription>Estimate token output after tax withholding for popular price points.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="plan-tax-rate" className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Tax rate (%)
              </Label>
              <Input
                id="plan-tax-rate"
                type="number"
                min={0}
                max={100}
                step="1"
                value={taxRatePercent}
                onChange={(event) => onTaxRateChange(event.target.value)}
                className="w-32"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Adjust once and apply across all plan price points.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {planSummaries.map((plan) => {
              const inputValue = planOverrides[plan.price] ?? globalMultiplier;
              return (
                <PlanSummaryCard
                  key={plan.price}
                  data={plan}
                  inputValue={inputValue}
                  onChangeMultiplier={(value) => onPlanMultiplierChange(plan.price, value)}
                />
              );
            })}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

function PlanSummaryCard({
  data,
  inputValue,
  onChangeMultiplier,
}: {
  data: PlanSummary;
  inputValue: string;
  onChangeMultiplier: (value: string) => void;
}) {
  const taxLabel = `Tax withheld (${DECIMALS.format(data.taxRatePercent)}%)`;
  const tokensLabel = data.tokens > 0 ? WHOLE.format(data.tokens) : '—';
  const minutesLabel = formatMinutesDuration(data.minutes);
  const secondsTooltip = data.durationSeconds > 0 ? `${WHOLE.format(data.durationSeconds)} seconds` : undefined;
  const videoCount = data.durationSeconds >= 30 ? Math.floor(data.durationSeconds / 30) : 0;
  const videoCountLabel = videoCount > 0 ? `${WHOLE.format(videoCount)} clips` : '—';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Plan price</span>
        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{USD.format(data.price)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <PlanMultiplierEditor value={inputValue} applied={data.multiplier} onChange={onChangeMultiplier} />
      </div>
      <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <PlanRow label={taxLabel} value={USD.format(data.taxAmount)} />
        <PlanRow label="Net revenue" value={USD.format(data.netRevenue)} />
        <PlanRow label="Production cost" value={USD.format(data.costBasis)} />
        <PlanRow label="You earn" value={USD.format(data.profit)} highlight />
        <PlanRow label="Tokens covered" value={tokensLabel} />
        <PlanRow label="30s videos" value={videoCountLabel} />
        <PlanRow label="Video time covered" value={minutesLabel} tooltip={secondsTooltip} />
      </div>
    </div>
  );
}

function PlanRow({ label, value, highlight = false, tooltip }: { label: string; value: string; highlight?: boolean; tooltip?: string }) {
  const valueClasses = highlight ? 'font-semibold text-gray-900 dark:text-gray-100' : '';
  const content = <span className={valueClasses}>{value}</span>;

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      {tooltip ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`${valueClasses} cursor-help`}>{value}</span>
            </TooltipTrigger>
            <TooltipContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        content
      )}
    </div>
  );
}

function formatMinutesDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (wholeMinutes === 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${wholeMinutes}m`;
  }
  return `${wholeMinutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function PlanMultiplierEditor({ value, applied, onChange }: { value: string; applied: number; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span className="uppercase tracking-wide">Multiplier</span>
      <Input
        type="number"
        min={0}
        step="0.1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-20 text-sm"
      />
      <span>applied ×{DECIMALS.format(applied)}</span>
    </div>
  );
}
