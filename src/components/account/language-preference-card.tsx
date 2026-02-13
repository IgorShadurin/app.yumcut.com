"use client";

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DEFAULT_APP_LANGUAGE,
  type AppLanguageCode,
  parseAppLanguage,
} from '@/shared/constants/app-language';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';

type Copy = {
  title: string;
  hint: string;
  saving: string;
};

const COPY: Record<AppLanguageCode, Copy> = {
  en: {
    title: 'Interface language',
    hint: 'Choose which language to use in the app interface.',
    saving: 'Saving…',
  },
  ru: {
    title: 'Язык интерфейса',
    hint: 'Выберите язык, который будет использоваться в интерфейсе приложения.',
    saving: 'Сохраняем…',
  },
};

const MIN_SAVING_VISIBLE_MS = 3000;

export function LanguagePreferenceCard({ initialLanguage }: { initialLanguage: AppLanguageCode }) {
  const { language, setLanguage } = useAppLanguage();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<AppLanguageCode>(initialLanguage);
  const copy = useMemo(() => COPY[language], [language]);

  useEffect(() => {
    const normalized = parseAppLanguage(initialLanguage) ?? DEFAULT_APP_LANGUAGE;
    setValue(normalized);
  }, [initialLanguage]);

  const onLanguageChange = async (nextRaw: string) => {
    const next = parseAppLanguage(nextRaw) ?? DEFAULT_APP_LANGUAGE;
    const previous = value;
    const startedAt = Date.now();
    setValue(next);
    setLanguage(next);
    setSaving(true);
    try {
      const response = await Api.updateAccountLanguage(next);
      const confirmed = parseAppLanguage(response.language) ?? next;
      setValue(confirmed);
      setLanguage(confirmed);
    } catch {
      setValue(previous);
      setLanguage(previous);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SAVING_VISIBLE_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_SAVING_VISIBLE_MS - elapsed));
      }
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{copy.hint}</p>
        <div className="flex items-center gap-3">
          <Select value={value} onValueChange={onLanguageChange} disabled={saving}>
            <SelectTrigger className="max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ru">Русский</SelectItem>
            </SelectContent>
          </Select>
          {saving ? (
            <span className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {copy.saving}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
