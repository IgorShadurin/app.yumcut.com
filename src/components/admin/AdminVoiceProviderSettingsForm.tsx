'use client';

import { useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { VOICE_PROVIDERS, type VoiceProviderId } from '@/shared/constants/voice-providers';
import type { AdminVoiceProviderSettingsDTO } from '@/shared/types';

interface Props {
  initial: AdminVoiceProviderSettingsDTO;
}

type PendingChange = {
  providerId: VoiceProviderId;
  nextEnabled: boolean;
};

export function AdminVoiceProviderSettingsForm({ initial }: Props) {
  const [enabledProviders, setEnabledProviders] = useState<VoiceProviderId[]>(() => {
    const allowed = new Set((initial.enabledProviders || []) as VoiceProviderId[]);
    return VOICE_PROVIDERS.map((provider) => provider.id).filter((id) => allowed.has(id));
  });
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);

  const enabledSet = useMemo(() => new Set(enabledProviders), [enabledProviders]);

  const requestToggle = (providerId: VoiceProviderId, nextEnabled: boolean) => {
    if (saving) return;
    setPendingChange({ providerId, nextEnabled });
  };

  const applyChange = async () => {
    if (!pendingChange) return;
    const previous = enabledProviders;
    const next = pendingChange.nextEnabled
      ? Array.from(new Set([...enabledProviders, pendingChange.providerId]))
      : enabledProviders.filter((id) => id !== pendingChange.providerId);

    setEnabledProviders(next);
    setSaving(true);
    try {
      const updated = await Api.updateAdminVoiceProviderSettings({ enabledProviders: next });
      setEnabledProviders((updated.enabledProviders || []) as VoiceProviderId[]);
    } catch (err) {
      console.error('Failed to update voice provider settings', err);
      setEnabledProviders(previous);
    } finally {
      setSaving(false);
      setPendingChange(null);
    }
  };

  const activeProvider = pendingChange
    ? VOICE_PROVIDERS.find((provider) => provider.id === pendingChange.providerId) ?? null
    : null;

  return (
    <>
      <div className="space-y-3">
        {VOICE_PROVIDERS.map((provider) => {
          const checked = enabledSet.has(provider.id);
          return (
            <div
              key={provider.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="space-y-1">
                <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{provider.label}</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {checked ? 'Enabled for new projects.' : 'Hidden from new projects.'}
                </p>
              </div>
              <Switch
                checked={checked}
                onCheckedChange={(value) => requestToggle(provider.id, value === true)}
                disabled={saving}
                aria-label={`${provider.label} provider`}
              />
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!pendingChange}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingChange(null);
        }}
      >
        <DialogContent className="max-w-md" ariaDescription="Confirm voice provider update">
          <DialogHeader>
            <DialogTitle>Confirm provider change</DialogTitle>
            <DialogDescription className="sr-only">
              Confirm updating the available voice providers for new projects.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {activeProvider
              ? `This will ${pendingChange?.nextEnabled ? 'enable' : 'disable'} ${activeProvider.label} for new projects.`
              : 'Confirm this provider change.'}
          </p>
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm leading-5">
              Existing projects will keep their current provider assignments.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingChange(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={applyChange} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
