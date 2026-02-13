import type { TargetLanguageCode } from './languages';

export type SchedulerCadenceValue =
  | 'daily'
  | 'every_2_days'
  | 'every_3_days'
  | 'every_4_days'
  | 'every_5_days'
  | 'every_6_days'
  | 'every_7_days';

export const SCHEDULER_CADENCE_OPTIONS: Array<{ value: SchedulerCadenceValue; label: string; days: number }> = [
  { value: 'daily', label: 'Every day', days: 1 },
  { value: 'every_2_days', label: 'Every 2nd day', days: 2 },
  { value: 'every_3_days', label: 'Every 3rd day', days: 3 },
  { value: 'every_4_days', label: 'Every 4th day', days: 4 },
  { value: 'every_5_days', label: 'Every 5th day', days: 5 },
  { value: 'every_6_days', label: 'Every 6th day', days: 6 },
  { value: 'every_7_days', label: 'Every 7th day', days: 7 },
];

const DEFAULT_TIMES: Record<string, string> = {
  en: '21:00',
  es: '09:00',
  it: '09:00',
  de: '09:00',
  pt: '09:00',
  ru: '07:00',
  fr: '07:00',
};

export function getDefaultSchedulerTime(code: string | null | undefined): string {
  const normalized = (code ?? '').toLowerCase();
  return DEFAULT_TIMES[normalized] || '07:00';
}

export function normalizeSchedulerTime(value: string | null | undefined): string {
  if (!value) return '07:00';
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : '07:00';
}

export function getCadenceDays(value: SchedulerCadenceValue | null | undefined): number {
  const fallback = 3;
  const found = SCHEDULER_CADENCE_OPTIONS.find((item) => item.value === value);
  return found?.days ?? fallback;
}

export function getDefaultCadence(): SchedulerCadenceValue {
  return 'every_3_days';
}

export function normalizeCadence(value: string | null | undefined): SchedulerCadenceValue {
  const normalized = (value ?? '').trim() as SchedulerCadenceValue;
  return SCHEDULER_CADENCE_OPTIONS.some((item) => item.value === normalized) ? normalized : getDefaultCadence();
}

export function buildDefaultSchedulerTimes(languages: TargetLanguageCode[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const code of languages) {
    result[code] = getDefaultSchedulerTime(code);
  }
  return result;
}
