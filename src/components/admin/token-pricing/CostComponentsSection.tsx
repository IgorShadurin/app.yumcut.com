'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ComponentMeta, ItemTemplate, ParsedItem } from '@/components/admin/token-pricing/types';
import { Badge } from '@/components/ui/badge';
import { Settings2 } from 'lucide-react';
import { USD } from '@/components/admin/token-pricing/formatters';

export type CostComponentsSectionProps = {
  items: ItemTemplate[];
  parsedItems: ParsedItem[];
  componentMeta: Record<string, ComponentMeta>;
  onResetDefaults: () => void;
  onQuantityChange: (id: string, value: string) => void;
  onUnitCostChange: (id: string, value: string) => void;
  onToggleComponent: (id: string, enabled: boolean) => void;
};

export function CostComponentsSection({
  items,
  parsedItems,
  componentMeta,
  onResetDefaults,
  onQuantityChange,
  onUnitCostChange,
  onToggleComponent,
}: CostComponentsSectionProps) {
  const parsedMap = new Map(parsedItems.map((item) => [item.id, item]));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold tracking-tight">Cost components</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Toggle or override price assumptions from each provider.</p>
        </div>
        <Button variant="outline" onClick={onResetDefaults}>
          Reset to defaults
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const meta = componentMeta[item.id] ?? { icon: undefined, colorClass: 'text-gray-500' };
          const Icon = meta.icon;
          const parsed = parsedMap.get(item.id);
          const providerBadge = <Badge variant="info">{item.provider}</Badge>;

          return (
            <Card key={item.id} className={item.enabled ? undefined : 'border-dashed opacity-75'}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <div className="flex items-center gap-2">
                    {Icon ? <Icon className={`h-4 w-4 ${meta.colorClass}`} /> : null}
                    <CardTitle className="text-base font-semibold">{item.label}</CardTitle>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unit: {item.unit}</p>
                </div>
                {item.providerLink ? (
                  <a href={item.providerLink} target="_blank" rel="noreferrer" className="inline-flex">
                    {providerBadge}
                  </a>
                ) : (
                  providerBadge
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`quantity-${item.id}`}>Quantity</Label>
                    <Input
                      id={`quantity-${item.id}`}
                      type="number"
                      min={0}
                      step={item.id === 'images' ? 1 : 0.1}
                      value={item.quantity}
                      onChange={(event) => onQuantityChange(item.id, event.target.value)}
                      disabled={!item.enabled}
                    />
                    {item.helper ? <p className="text-xs text-gray-500 dark:text-gray-400">{item.helper}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`unit-cost-${item.id}`}>Unit cost (USD)</Label>
                    <Input
                      id={`unit-cost-${item.id}`}
                      type="number"
                      min={0}
                      step="0.0001"
                      value={item.unitCost}
                      onChange={(event) => onUnitCostChange(item.id, event.target.value)}
                      disabled={!item.enabled}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Line total: {USD.format(parsed?.lineTotal ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900">
                  <span className="font-medium">Include in cost</span>
                  <Switch checked={item.enabled} onCheckedChange={(checked) => onToggleComponent(item.id, checked)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
