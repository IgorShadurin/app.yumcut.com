const DEFAULT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export const dateTimeFormatter = DEFAULT_DATE_TIME_FORMATTER;

const DEFAULT_DATE_TIME_WITH_SECONDS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatDateTime(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return dateTimeFormatter.format(date);
}

export function formatDateTimeWithSeconds(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return DEFAULT_DATE_TIME_WITH_SECONDS_FORMATTER.format(date);
}

// Admin-specific timezone helpers (Moscow, UTC+03:00)
export const MOSCOW_TIME_ZONE = 'Europe/Moscow';

const MSK_SHORT_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: MOSCOW_TIME_ZONE,
});

const MSK_LONG_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: MOSCOW_TIME_ZONE,
});

/**
 * Admin-only datetime formatter.
 * Use across admin UI to render timestamps in Europe/Moscow (UTC+03:00).
 * Notes:
 * - DB timestamps are serialized to UTC (ISO 8601 with Z) in our APIs.
 * - This function adjusts display only; it does not alter stored values.
 */
export function formatDateTimeAdmin(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return MSK_SHORT_FORMATTER.format(date);
}

/**
 * Admin-only long datetime formatter for detailed headers/sections.
 * See formatDateTimeAdmin for timezone rationale.
 */
export function formatDateTimeAdminLong(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return MSK_LONG_FORMATTER.format(date);
}
