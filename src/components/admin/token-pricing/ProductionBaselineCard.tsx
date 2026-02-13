'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SlidersHorizontal } from 'lucide-react';

export type ProductionBaselineCardProps = {
  tokensPerUnit: string;
  durationSeconds: string;
  multiplier: string;
  onTokensPerUnitChange: (value: string) => void;
  onDurationSecondsChange: (value: string) => void;
  onMultiplierChange: (value: string) => void;
};

export function ProductionBaselineCard({
  tokensPerUnit,
  durationSeconds,
  multiplier,
  onTokensPerUnitChange,
  onDurationSecondsChange,
  onMultiplierChange,
}: ProductionBaselineCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-sky-500" />
          <CardTitle>Production baseline</CardTitle>
        </div>
        <CardDescription>Adjust the assumptions for a single 60-second video token bundle.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="tokens-per-unit">Tokens per deliverable</Label>
          <Input
            id="tokens-per-unit"
            type="number"
            min={1}
            step={1}
            value={tokensPerUnit}
            onChange={(event) => onTokensPerUnitChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration-seconds">Video duration (seconds)</Label>
          <Input
            id="duration-seconds"
            type="number"
            min={1}
            step="1"
            value={durationSeconds}
            onChange={(event) => onDurationSecondsChange(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="multiplier">Target multiplier</Label>
          <Input
            id="multiplier"
            type="number"
            min={0}
            step="0.05"
            value={multiplier}
            onChange={(event) => onMultiplierChange(event.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
