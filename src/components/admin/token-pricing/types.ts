import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ComponentMeta = {
  icon: LucideIcon;
  colorClass: string;
};

export type ItemTemplate = {
  id: string;
  label: string;
  provider: string;
  providerLink?: string;
  unit: string;
  quantity: string;
  unitCost: string;
  enabled: boolean;
  helper?: ReactNode;
};

export type ComputedCostItem = {
  id: string;
  label: string;
  provider: string;
  total: number;
};

export type ParsedItem = {
  id: string;
  label: string;
  provider: string;
  providerLink?: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  enabled: boolean;
  helper?: ReactNode;
};

export type PlanSummary = {
  price: number;
  taxAmount: number;
  netRevenue: number;
  tokens: number;
  minutes: number;
  taxRatePercent: number;
  costBasis: number;
  profit: number;
  durationSeconds: number;
  multiplier: number;
};

export type EarningsSummary = {
  price: number;
  profitPerPlan: number;
  plansNeeded: number | null;
};
