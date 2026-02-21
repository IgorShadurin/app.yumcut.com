'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { Api } from '@/lib/api-client';
import type { AdminProjectCreationSettingsDTO } from '@/shared/types';

interface Props {
  initial: AdminProjectCreationSettingsDTO;
}

const MAX_REASON_LENGTH = 500;
const REQUIRED_DISABLED_REASON = 'Please add a short reason before disabling project creation.';

export function AdminProjectCreationSettingsForm({ initial }: Props) {
  const [settings, setSettings] = useState<AdminProjectCreationSettingsDTO>(initial);
  const [draftReason, setDraftReason] = useState(initial.projectCreationDisabledReason);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const normalizedDraftReason = draftReason.trim();
  const reasonForSave = normalizedDraftReason.slice(0, MAX_REASON_LENGTH);

  const apply = async (nextEnabled: boolean) => {
    if (!nextEnabled && !reasonForSave) {
      setValidationError(REQUIRED_DISABLED_REASON);
      return;
    }

    const previous = settings;
    const nextState: AdminProjectCreationSettingsDTO = {
      projectCreationEnabled: nextEnabled,
      projectCreationDisabledReason: reasonForSave,
    };

    setSettings(nextState);
    setSaving(true);
    setValidationError(null);
    try {
      const updated = await Api.updateAdminProjectCreationSettings(nextState);
      setSettings(updated);
      setDraftReason(updated.projectCreationDisabledReason);
    } catch (err) {
      console.error('Failed to update project creation settings', err);
      setSettings(previous);
      setDraftReason(previous.projectCreationDisabledReason);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="space-y-1">
          <Label className="text-base font-medium text-gray-900 dark:text-gray-100">Project creation</Label>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Turn project creation on/off across the whole app.
          </p>
        </div>
        <Switch
          checked={settings.projectCreationEnabled}
          onCheckedChange={apply}
          disabled={saving}
          aria-label="Enable project creation"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-creation-reason" className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Reason (shown to users when disabled)
        </Label>
        <Textarea
          id="project-creation-reason"
          value={draftReason}
          maxLength={MAX_REASON_LENGTH}
          onChange={(e) => setDraftReason(e.target.value)}
          className="min-h-28 resize-y bg-white dark:bg-gray-950"
          placeholder="Explain why creation is disabled and when it may resume..."
          disabled={saving}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          A reason is required whenever project creation is disabled.
        </p>
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-xs leading-5">
            {settings.projectCreationEnabled
              ? 'Creation is enabled. Users can submit projects from the homepage and API.'
              : `Creation is disabled. Live reason: ${reasonForSave || 'No reason provided.'}`}
          </p>
        </div>
        {validationError ? <p className="text-sm text-rose-600 dark:text-rose-300">{validationError}</p> : null}
      </div>
    </div>
  );
}
