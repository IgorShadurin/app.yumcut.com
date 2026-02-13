'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Api } from '@/lib/api-client';
import type { AdminImageEditorSettingsDTO } from '@/shared/types';

interface Props {
  initial: AdminImageEditorSettingsDTO;
}

export function AdminImageEditorSettingsForm({ initial }: Props) {
  const [settings, setSettings] = useState<AdminImageEditorSettingsDTO>(initial);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saving) return;
    const previous = settings.enabled;
    const next = !previous;
    setSettings({ enabled: next });
    setSaving(true);
    try {
      const updated = await Api.updateAdminImageEditorSettings({ enabled: next });
      setSettings(updated);
    } catch (err) {
      console.error('Failed to update image editor settings', err);
      setSettings({ enabled: previous });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="space-y-1">
        <Label className="text-base font-medium text-gray-900 dark:text-gray-100">Enable image editor</Label>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Show the image editor on completed v2 custom template projects.
        </p>
      </div>
      <Switch
        checked={settings.enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
        aria-label="Enable image editor"
      />
    </div>
  );
}
