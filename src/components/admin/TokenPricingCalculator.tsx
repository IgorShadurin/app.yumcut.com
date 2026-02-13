"use client";

import { useCallback, useMemo, useState } from 'react';
import { Image as ImageIcon, Mic, FileText, Wand2 } from 'lucide-react';

import { ProductionBaselineCard } from '@/components/admin/token-pricing/ProductionBaselineCard';
import { PricingSnapshotSection } from '@/components/admin/token-pricing/PricingSnapshotSection';
import { PlanSimulationsSection } from '@/components/admin/token-pricing/PlanSimulationsSection';
import { CostComponentsSection } from '@/components/admin/token-pricing/CostComponentsSection';
import { EarningsSimulationsSection } from '@/components/admin/token-pricing/EarningsSimulationsSection';
import { ExitValuationSection } from '@/components/admin/token-pricing/ExitValuationSection';
import {
  ComponentMeta,
  ItemTemplate,
  ParsedItem,
  PlanSummary,
  EarningsSummary,
  ComputedCostItem,
} from '@/components/admin/token-pricing/types';

const DEFAULT_TAX_RATE_PERCENT = '30';
const PLAN_PRICES = [20, 49, 99];
const DEFAULT_PLAN_MULTIPLIER = '3';
const DEFAULT_EXIT_GOAL = '10000000';
const DEFAULT_EXIT_TAX_PERCENT = '40';
const DEFAULT_EXIT_MULTIPLE = '3';

const COMPONENT_META: Record<string, ComponentMeta> = {
  images: { icon: ImageIcon, colorClass: 'text-sky-500' },
  audio: { icon: Mic, colorClass: 'text-indigo-500' },
  script: { icon: FileText, colorClass: 'text-amber-500' },
  refine: { icon: Wand2, colorClass: 'text-rose-500' },
};

const DEFAULT_ITEMS: ItemTemplate[] = [
  {
    id: 'images',
    label: 'Images',
    provider: "Google's Nano Banana",
    unit: 'image',
    quantity: '12',
    unitCost: '0.04',
    enabled: true,
  },
  {
    id: 'audio',
    label: 'Narration audio',
    provider: '11 Labs',
    providerLink: 'https://elevenlabs.io/pricing/api',
    unit: 'minute',
    quantity: '1',
    unitCost: '0.12',
    enabled: true,
    helper: (
      <a
        href="https://elevenlabs.io/pricing/api"
        target="_blank"
        rel="noreferrer"
        className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
      >
        11 Labs pricing
      </a>
    ),
  },
  {
    id: 'script',
    label: 'Script generation',
    provider: 'Claude Sonnet 4',
    unit: 'minute',
    quantity: '1',
    unitCost: '0.006',
    enabled: true,
    helper: 'Long-form copy generation per minute of content.',
  },
  {
    id: 'refine',
    label: 'Editorial refine',
    provider: 'Internal refine pass',
    unit: 'minute',
    quantity: '1',
    unitCost: '0.006',
    enabled: false,
    helper: 'Second-pass polish using internal tooling.',
  },
];

export function TokenPricingCalculator() {
  const [items, setItems] = useState<ItemTemplate[]>(() => DEFAULT_ITEMS.map((item) => ({ ...item })));
  const [tokensPerUnit, setTokensPerUnit] = useState('60');
  const [durationSeconds, setDurationSeconds] = useState('60');
  const [multiplier, setMultiplier] = useState(DEFAULT_PLAN_MULTIPLIER);
  const [taxRatePercent, setTaxRatePercent] = useState(DEFAULT_TAX_RATE_PERCENT);
  const [earningsGoal, setEarningsGoal] = useState('10000');
  const [exitNetGoal, setExitNetGoal] = useState(DEFAULT_EXIT_GOAL);
  const [exitTaxPercent, setExitTaxPercent] = useState(DEFAULT_EXIT_TAX_PERCENT);
  const [exitRevenueMultiple, setExitRevenueMultiple] = useState(DEFAULT_EXIT_MULTIPLE);
  const [planOverrides, setPlanOverrides] = useState<Record<number, string>>(() => ({}));

  const parsedItems = useMemo<ParsedItem[]>(
    () =>
      items.map((item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unitCost) || 0;
        const lineTotal = item.enabled ? quantity * unitCost : 0;
        return {
          ...item,
          quantity,
          unitCost,
          lineTotal,
        };
      }),
    [items],
  );

  const costPrice = useMemo(() => parsedItems.reduce((total, item) => total + item.lineTotal, 0), [parsedItems]);
  const tokens = parseFloat(tokensPerUnit) || 0;
  const seconds = parseFloat(durationSeconds) || 0;
  const minutesPerVideo = seconds / 60 || 0;
  const parsedMultiplier = parseFloat(multiplier);
  const multiplierToUse = Number.isFinite(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 1;

  const costPerToken = tokens > 0 ? costPrice / tokens : 0;
  const targetPerToken = costPerToken * multiplierToUse;
  const targetPerVideo = targetPerToken * tokens;
  const costBreakdown = useMemo<ComputedCostItem[]>(
    () =>
      parsedItems
        .filter((item) => item.enabled && item.lineTotal > 0)
        .map((item) => ({
          id: item.id,
          label: item.label,
          provider: item.provider,
          total: item.lineTotal,
        }))
        .sort((a, b) => b.total - a.total),
    [parsedItems],
  );

  const planSummaries = useMemo<PlanSummary[]>(() => {
    const tokensPerBundle = tokens;
    const secondsPerBundle = seconds;
    const minutesPerBundle = secondsPerBundle / 60;
    const parsedTaxPercent = parseFloat(taxRatePercent);
    const taxRate = Number.isFinite(parsedTaxPercent) && parsedTaxPercent > 0 ? parsedTaxPercent / 100 : 0;

    return PLAN_PRICES.map((price) => {
      const override = planOverrides[price];
      const overrideValue = override ? parseFloat(override) : parseFloat(multiplier);
      const overrideMultiplier = Number.isFinite(overrideValue) && overrideValue > 0 ? overrideValue : 1;

      const taxAmount = price * taxRate;
      const netRevenue = price - taxAmount;
      const effectiveTargetPerToken = costPerToken * overrideMultiplier;

      if (effectiveTargetPerToken <= 0) {
        return {
          price,
          taxAmount,
          netRevenue,
          tokens: 0,
          minutes: 0,
          taxRatePercent: taxRate * 100,
          costBasis: 0,
          profit: netRevenue,
          durationSeconds: 0,
          multiplier: overrideMultiplier,
        };
      }

      const purchasableTokens = netRevenue / effectiveTargetPerToken;
      const wholeTokens = Math.max(0, Math.floor(purchasableTokens));
      const minutes = tokensPerBundle > 0 && minutesPerBundle > 0 ? (wholeTokens / tokensPerBundle) * minutesPerBundle : 0;
      const costBasis = wholeTokens * costPerToken;
      const profit = netRevenue - costBasis;
      const durationForPlan = minutes > 0 ? Math.max(0, Math.round(minutes * 60)) : 0;

      return {
        price,
        taxAmount,
        netRevenue,
        tokens: wholeTokens,
        minutes,
        taxRatePercent: taxRate * 100,
        costBasis,
        profit,
        durationSeconds: durationForPlan,
        multiplier: overrideMultiplier,
      };
    });
  }, [planOverrides, multiplier, taxRatePercent, costPerToken, tokens, seconds]);

  const earningsSummaries = useMemo<EarningsSummary[]>(() => {
    const goalValue = parseFloat(earningsGoal);
    const effectiveGoal = Number.isFinite(goalValue) && goalValue > 0 ? goalValue : 0;

    return planSummaries.map((plan) => {
      if (plan.profit <= 0 || effectiveGoal <= 0) {
        return {
          price: plan.price,
          profitPerPlan: plan.profit,
          plansNeeded: null,
        };
      }
      return {
        price: plan.price,
        profitPerPlan: plan.profit,
        plansNeeded: Math.ceil(effectiveGoal / plan.profit),
      };
    });
  }, [earningsGoal, planSummaries]);

  const handlePlanMultiplierChange = useCallback(
    (price: number, rawValue: string) => {
      const sanitized = handleNumberInput(rawValue);
      const numeric = parseFloat(sanitized);

      setPlanOverrides((prev) => {
        const next = { ...prev };
        if (!sanitized || !Number.isFinite(numeric) || numeric <= 0 || sanitized === multiplier) {
          delete next[price];
        } else {
          next[price] = sanitized;
        }
        return next;
      });
    },
    [multiplier],
  );

  const handleQuantityChange = useCallback((id: string, value: string) => {
    const sanitized = handleNumberInput(value);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: sanitized } : item)));
  }, []);

  const handleUnitCostChange = useCallback((id: string, value: string) => {
    const sanitized = handleNumberInput(value);
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, unitCost: sanitized } : item)));
  }, []);

  const handleToggleComponent = useCallback((id: string, enabled: boolean) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }, []);

  const handleResetDefaults = useCallback(() => {
    setItems(DEFAULT_ITEMS.map((item) => ({ ...item })));
    setTokensPerUnit('60');
    setDurationSeconds('60');
    setMultiplier(DEFAULT_PLAN_MULTIPLIER);
    setPlanOverrides({});
    setExitNetGoal(DEFAULT_EXIT_GOAL);
    setExitTaxPercent(DEFAULT_EXIT_TAX_PERCENT);
    setExitRevenueMultiple(DEFAULT_EXIT_MULTIPLE);
  }, []);

  const exitNetGoalValue = parseFloat(exitNetGoal) || 0;
  const exitTaxRate = (() => {
    const parsed = parseFloat(exitTaxPercent);
    if (!Number.isFinite(parsed)) return 0;
    const clamped = Math.min(Math.max(parsed, 0), 99.9);
    return clamped / 100;
  })();
  const exitRevenueMultipleValue = (() => {
    const parsed = parseFloat(exitRevenueMultiple);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  })();
  const exitSalePrice = exitNetGoalValue > 0 ? exitNetGoalValue / (1 - exitTaxRate) : 0;
  const exitAnnualRevenue = exitRevenueMultipleValue > 0 ? exitSalePrice / exitRevenueMultipleValue : 0;
  const exitMRR = exitAnnualRevenue / 12;
  const exitMonthsMultiple = exitRevenueMultipleValue * 12;
  const imagesItem = parsedItems.find((item) => item.id === 'images');
  const imagesPerMinute = imagesItem && minutesPerVideo > 0 ? imagesItem.quantity / minutesPerVideo : 0;
  const imageComponentDetail = imagesItem
    ? {
        unit: imagesItem.unit,
        quantity: imagesItem.quantity,
        unitCost: imagesItem.unitCost,
        lineTotal: imagesItem.lineTotal,
        provider: imagesItem.provider,
        enabled: imagesItem.enabled,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <ProductionBaselineCard
        tokensPerUnit={tokensPerUnit}
        durationSeconds={durationSeconds}
        multiplier={multiplier}
        onTokensPerUnitChange={(value) => setTokensPerUnit(handleNumberInput(value))}
        onDurationSecondsChange={(value) => setDurationSeconds(handleNumberInput(value))}
        onMultiplierChange={(value) => setMultiplier(handleNumberInput(value))}
      />

      <PricingSnapshotSection
        costPerVideo={costPrice}
        costPerToken={costPerToken}
        targetPerVideo={targetPerVideo}
        targetPerToken={targetPerToken}
        multiplier={multiplierToUse}
        tokensPerUnit={tokens}
        costBreakdown={costBreakdown}
        componentMeta={COMPONENT_META}
      />

      <PlanSimulationsSection
        taxRatePercent={taxRatePercent}
        onTaxRateChange={(value) => setTaxRatePercent(handleNumberInput(value))}
        planSummaries={planSummaries}
        planOverrides={planOverrides}
        globalMultiplier={multiplier}
        onPlanMultiplierChange={handlePlanMultiplierChange}
      />

      <EarningsSimulationsSection
        earningsGoal={earningsGoal}
        onEarningsGoalChange={(value) => setEarningsGoal(handleNumberInput(value))}
        earningsSummaries={earningsSummaries}
      />

      <ExitValuationSection
        netProceedsGoal={exitNetGoal}
        onNetProceedsGoalChange={(value) => setExitNetGoal(handleNumberInput(value))}
        taxRatePercent={exitTaxPercent}
        onTaxRatePercentChange={(value) => setExitTaxPercent(handleNumberInput(value))}
        revenueMultiple={exitRevenueMultiple}
        onRevenueMultipleChange={(value) => setExitRevenueMultiple(handleNumberInput(value))}
        salePrice={exitSalePrice}
        requiredAnnualRevenue={exitAnnualRevenue}
        requiredMRR={exitMRR}
        monthsMultiple={exitMonthsMultiple}
        planSummaries={planSummaries}
        tokensPerVideo={tokens}
        minutesPerVideo={minutesPerVideo}
        imagesPerMinute={imagesPerMinute}
        imageComponent={imageComponentDetail}
        targetPerVideo={targetPerVideo}
        costPerVideo={costPrice}
      />

      <CostComponentsSection
        items={items}
        parsedItems={parsedItems}
        componentMeta={COMPONENT_META}
        onResetDefaults={handleResetDefaults}
        onQuantityChange={handleQuantityChange}
        onUnitCostChange={handleUnitCostChange}
        onToggleComponent={handleToggleComponent}
      />
    </div>
  );
}

function handleNumberInput(value: string) {
  if (value.trim() === '') return '';
  return value;
}
