'use client';

import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Target } from 'lucide-react';
import { SummaryStat } from '@/components/admin/token-pricing/SummaryStat';
import { USD, DECIMALS, DECIMALS_2, WHOLE, USD_WHOLE } from '@/components/admin/token-pricing/formatters';
import { PlanSummary } from '@/components/admin/token-pricing/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type ExitValuationSectionProps = {
  netProceedsGoal: string;
  onNetProceedsGoalChange: (value: string) => void;
  taxRatePercent: string;
  onTaxRatePercentChange: (value: string) => void;
  revenueMultiple: string;
  onRevenueMultipleChange: (value: string) => void;
  salePrice: number;
  requiredAnnualRevenue: number;
  requiredMRR: number;
  monthsMultiple: number;
  planSummaries: PlanSummary[];
  tokensPerVideo: number;
  minutesPerVideo: number;
  imagesPerMinute: number;
  imageComponent?: {
    unit: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    provider: string;
    enabled: boolean;
  };
  targetPerVideo: number;
  costPerVideo: number;
};

export function ExitValuationSection({
  netProceedsGoal,
  onNetProceedsGoalChange,
  taxRatePercent,
  onTaxRatePercentChange,
  revenueMultiple,
  onRevenueMultipleChange,
  salePrice,
  requiredAnnualRevenue,
  requiredMRR,
  monthsMultiple,
  planSummaries,
  tokensPerVideo,
  minutesPerVideo,
  imagesPerMinute,
  imageComponent,
  targetPerVideo,
  costPerVideo,
}: ExitValuationSectionProps) {
  const parsedExitTax = parseFloat(taxRatePercent);
  const exitTaxRate = Number.isFinite(parsedExitTax) ? Math.min(Math.max(parsedExitTax, 0), 99.9) / 100 : 0;
  const marginPerVideo = Math.max(targetPerVideo - costPerVideo, 0);
  const grossMargin = targetPerVideo > 0 ? marginPerVideo / targetPerVideo : 0;
  const annualProfit = Math.max(requiredAnnualRevenue * grossMargin, 0);
  const monthlyProfit = Math.max(requiredMRR * grossMargin, 0);
  const annualProfitAfterTax = annualProfit * (1 - exitTaxRate);
  const monthlyProfitAfterTax = monthlyProfit * (1 - exitTaxRate);
  const planBreakdown = planSummaries.map((plan) => {
    const price = plan.price;
    const tokensPerPlan = plan.tokens;
    if (price <= 0) {
      return {
        price,
        plansPerYear: null,
        plansPerMonth: null,
        minutesPerYear: null,
        minutesPerMonth: null,
        minutesPerDay: null,
        imagesPerYear: null,
        imagesPerMonth: null,
        imagesPerDay: null,
      };
    }
    const plansPerYear = requiredAnnualRevenue > 0 ? requiredAnnualRevenue / price : 0;
    const plansPerMonth = requiredMRR > 0 ? requiredMRR / price : 0;
    const videosPerYear = tokensPerVideo > 0 ? (plansPerYear * tokensPerPlan) / tokensPerVideo : null;
    const videosPerMonth = tokensPerVideo > 0 ? (plansPerMonth * tokensPerPlan) / tokensPerVideo : null;
    const minutesPerYear = videosPerYear != null ? videosPerYear * minutesPerVideo : null;
    const minutesPerMonth = videosPerMonth != null ? videosPerMonth * minutesPerVideo : null;
    const minutesPerDay = minutesPerMonth != null ? minutesPerMonth / 30 : null;
    const imagesPerYear = imagesPerMinute > 0 && minutesPerYear != null ? minutesPerYear * imagesPerMinute : null;
    const imagesPerMonth = imagesPerMinute > 0 && minutesPerMonth != null ? minutesPerMonth * imagesPerMinute : null;
    const imagesPerDay = imagesPerMonth != null ? imagesPerMonth / 30 : null;
    return {
      price,
      plansPerYear,
      plansPerMonth,
      minutesPerYear,
      minutesPerMonth,
      minutesPerDay,
      imagesPerYear,
      imagesPerMonth,
      imagesPerDay,
    };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-500" />
          <CardTitle>Exit valuation planning</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="exit-net-goal">Take-home target (USD)</Label>
            <Input
              id="exit-net-goal"
              type="number"
              min={0}
              step="100000"
              value={netProceedsGoal}
              onChange={(event) => onNetProceedsGoalChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exit-tax-rate">Exit tax estimate (%)</Label>
            <Input
              id="exit-tax-rate"
              type="number"
              min={0}
              max={100}
              step="1"
              value={taxRatePercent}
              onChange={(event) => onTaxRatePercentChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exit-multiple">Revenue multiple (× annual)</Label>
            <Input
              id="exit-multiple"
              type="number"
              min={0}
              step="0.5"
              value={revenueMultiple}
              onChange={(event) => onRevenueMultipleChange(event.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">Equivalent to {DECIMALS.format(monthsMultiple)} months of revenue.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryStat label="Required sale price" value={USD_WHOLE.format(Math.ceil(salePrice))} />
          <SummaryStat
            label={<Abbr title="Annual Recurring Revenue">ARR</Abbr>}
            value={USD_WHOLE.format(Math.ceil(requiredAnnualRevenue))}
            caption={formatProfitCaption(annualProfit, annualProfitAfterTax)}
          />
          <SummaryStat
            label={<Abbr title="Monthly Recurring Revenue">MRR</Abbr>}
            value={USD_WHOLE.format(Math.ceil(requiredMRR))}
            caption={formatProfitCaption(monthlyProfit, monthlyProfitAfterTax)}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Plan volume needed</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {planBreakdown.map((entry) => {
              const plansYearDisplay = formatCount(entry.plansPerYear);
              const plansMonthDisplay = formatDecimal(entry.plansPerMonth);
              const minutesPerYearDisplay = formatDecimal(entry.minutesPerYear);
              const minutesPerMonthDisplay = formatDecimal(entry.minutesPerMonth);
              const minutesPerDayDisplay = formatDecimal(entry.minutesPerDay);
              const imagesPerYearDisplay = formatCount(entry.imagesPerYear);
              const imagesPerMonthDisplay = formatDecimal(entry.imagesPerMonth);
              const imagesPerDayDisplay = formatDecimal(entry.imagesPerDay);
              return (
                <div
                  key={entry.price}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/50"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Plan price</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{USD.format(entry.price)}</div>
                  <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <InfoRow label="Plans/month" value={plansMonthDisplay} />
                      <InfoRow label="Plans/year" value={plansYearDisplay} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <MetricColumn
                        title="Images"
                        rows={[
                          { label: 'Day', value: imagesPerDayDisplay },
                          { label: 'Month', value: imagesPerMonthDisplay },
                          { label: 'Year', value: imagesPerYearDisplay },
                        ]}
                      />
                      <MetricColumn
                        title="Video minutes"
                        rows={[
                          { label: 'Day', value: minutesPerDayDisplay },
                          { label: 'Month', value: minutesPerMonthDisplay },
                          { label: 'Year', value: minutesPerYearDisplay },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

function formatCount(count: number | null) {
  if (count === null) return '—';
  if (!Number.isFinite(count) || count <= 0) return '—';
  return WHOLE.format(Math.ceil(count));
}

function formatDecimal(value: number | null) {
  if (value === null) return '—';
  if (!Number.isFinite(value) || value <= 0) return '—';
  return DECIMALS_2.format(value);
}

function Abbr({ title, children }: { title: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help" aria-label={title}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DividerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

function MetricColumn({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{row.label}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatProfitCaption(preTax: number, postTax: number) {
  if (!Number.isFinite(postTax) || postTax <= 0) {
    return '— profit after costs & tax';
  }
  return `${USD.format(postTax)} profit after costs & tax`;
}
