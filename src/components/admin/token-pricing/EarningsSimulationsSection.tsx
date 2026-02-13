'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Target } from 'lucide-react';
import { EarningsSummary } from '@/components/admin/token-pricing/types';
import { USD, WHOLE } from '@/components/admin/token-pricing/formatters';

export type EarningsSimulationsSectionProps = {
  earningsGoal: string;
  onEarningsGoalChange: (value: string) => void;
  earningsSummaries: EarningsSummary[];
};

export function EarningsSimulationsSection({ earningsGoal, onEarningsGoalChange, earningsSummaries }: EarningsSimulationsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-500" />
          <CardTitle>Earnings simulations</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Label htmlFor="earnings-goal" className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Target earnings (USD)
              </Label>
              <Input
                id="earnings-goal"
                type="number"
                min={0}
                step="100"
                value={earningsGoal}
                onChange={(event) => onEarningsGoalChange(event.target.value)}
                className="w-40"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Required sales using the net profit per plan.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {earningsSummaries.map((summary) => {
              const profitDisplay = summary.profitPerPlan > 0 ? USD.format(summary.profitPerPlan) : '—';
              const planLabel = `$${summary.price}`;
              const plansNeededDisplay = summary.plansNeeded != null ? WHOLE.format(summary.plansNeeded) : '—';
              return (
                <div
                  key={summary.price}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/50"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Plan price</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{planLabel}</div>
                  <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">You earn</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{profitDisplay}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Plans needed</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{plansNeededDisplay}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
