'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Api } from '@/lib/api-client';
import type { AdminNotificationSettingsDTO } from '@/shared/types';

interface Props {
  initial: AdminNotificationSettingsDTO;
}

type SettingKey = keyof AdminNotificationSettingsDTO;

const LABELS: Record<SettingKey, { title: string; description: string }> = {
  notifyNewUser: {
    title: 'Alert on new user sign-ups',
    description: 'Send a Telegram ping when someone creates a YumCut account.',
  },
  notifyNewProject: {
    title: 'Alert on new projects',
    description: 'Notify admins as soon as a user kicks off a project.',
  },
  notifyProjectDone: {
    title: 'Alert when projects finish',
    description: 'Send completion updates, including links, to all admin chats.',
  },
  notifyProjectError: {
    title: 'Alert when projects fail',
    description: 'Push error summaries (and any extra details) to admins so issues are actioned quickly.',
  },
};

export function AdminNotificationSettingsForm({ initial }: Props) {
  const [settings, setSettings] = useState<AdminNotificationSettingsDTO>(initial);
  const [pendingKey, setPendingKey] = useState<SettingKey | null>(null);

  const handleToggle = async (key: SettingKey) => {
    if (pendingKey) return;
    const previous = settings[key];
    const next = !previous;
    setSettings((prev) => ({ ...prev, [key]: next }));
    setPendingKey(key);
    try {
      const updated = await Api.updateAdminNotificationSettings({ [key]: next });
      setSettings(updated);
    } catch (err) {
      console.error('Failed to update admin notification setting', err);
      setSettings((prev) => ({ ...prev, [key]: previous }));
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {(Object.keys(LABELS) as SettingKey[]).map((key) => (
        <div key={key} className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="space-y-1">
            <Label className="text-base font-medium text-gray-900 dark:text-gray-100">{LABELS[key].title}</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">{LABELS[key].description}</p>
          </div>
          <Switch
            checked={settings[key]}
            onCheckedChange={() => handleToggle(key)}
            disabled={pendingKey === key}
            aria-label={LABELS[key].title}
          />
        </div>
      ))}
    </div>
  );
}
