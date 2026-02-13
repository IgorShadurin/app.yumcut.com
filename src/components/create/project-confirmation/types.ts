import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type SummaryItem = {
  key: string;
  tooltip: string;
  badge?: string;
  icon?: LucideIcon;
  emoji?: string;
  iconClass?: string;
  containerClass?: string;
  warning?: boolean;
  render?: ReactNode;
  renderClass?: string;
};

export type GuidanceSection = {
  key: 'creation' | 'avoidance' | 'audio';
  label: string;
  enabled: boolean;
  text?: string | null;
  iconClass: string;
  hoverClass: string;
  icon: LucideIcon;
  tags: string[];
};
