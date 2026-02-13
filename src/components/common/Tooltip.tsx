"use client";
import * as React from 'react';
import { Tooltip as STooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  content: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
};

export function Tooltip({ content, children, disabled, side, align }: Props) {
  if (disabled) return <>{children}</>;
  return (
    <TooltipProvider>
      <STooltip delayDuration={200}>
        <TooltipTrigger asChild>
          {children as any}
        </TooltipTrigger>
        <TooltipContent side={side} align={align}>{content}</TooltipContent>
      </STooltip>
    </TooltipProvider>
  );
}
