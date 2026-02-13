import { LANGUAGES, type TargetLanguageCode } from '@/shared/constants/languages';
import {
  buildDefaultSchedulerTimes,
  getDefaultCadence,
  normalizeSchedulerTime,
  normalizeCadence,
  type SchedulerCadenceValue,
} from '@/shared/constants/publish-scheduler';

export type SchedulerPreferences = {
  times: Record<string, string>;
  cadence: Record<string, SchedulerCadenceValue>;
};

const languageCodes = LANGUAGES.map((entry) => entry.code);

export function ensureSchedulerPreferences(rawTimes?: unknown, rawCadence?: unknown): SchedulerPreferences {
  const defaults = buildDefaultSchedulerTimes(languageCodes as TargetLanguageCode[]);
  const times: Record<string, string> = {};
  const cadence: Record<string, SchedulerCadenceValue> = {};
  const timeSource = (rawTimes && typeof rawTimes === 'object' ? (rawTimes as Record<string, string>) : {}) ?? {};
  const cadenceSource = (rawCadence && typeof rawCadence === 'object' ? (rawCadence as Record<string, string>) : {}) ?? {};

  for (const code of languageCodes) {
    times[code] = normalizeSchedulerTime(timeSource[code] ?? defaults[code]);
    cadence[code] = normalizeCadence(cadenceSource[code] ?? getDefaultCadence());
  }

  return { times, cadence };
}
