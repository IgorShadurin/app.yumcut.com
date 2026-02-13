import { config } from '@/server/config';

type LogPayload = Record<string, unknown>;

const SENSITIVE_STRING_KEYS = new Set([
  'receiptData',
  'signedPayload',
  'signedTransactionInfo',
  'signedRenewalInfo',
  'rawBody',
  'identityToken',
  'refreshToken',
  'accessToken',
]);

const SENSITIVE_ARRAY_KEYS = new Set(['signedTransactions', 'latest_receipt_info']);

function sanitizeObject(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = sanitizeValue(value, key);
  }
  return result;
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (key && SENSITIVE_STRING_KEYS.has(key)) {
      return `[redacted:${value.length}]`;
    }
    return value.length > 600 ? `${value.slice(0, 600)}…` : value;
  }
  if (Array.isArray(value)) {
    if (key && SENSITIVE_ARRAY_KEYS.has(key)) {
      return `[redacted:${value.length} items]`;
    }
    return value.map((entry) => sanitizeValue(entry));
  }
  if (typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

export function logAppleSubscriptionEvent(event: string, payload?: LogPayload) {
  if (!config.APPLE_SUBSCRIPTION_LOGS_ENABLED) {
    return;
  }
  const timestamp = new Date().toISOString();
  if (payload) {
    const augmented = { timestamp, ...payload };
    // eslint-disable-next-line no-console
    console.info(`[apple-subscription] ${event}`, sanitizeObject(augmented));
  } else {
    // eslint-disable-next-line no-console
    console.info(`[apple-subscription] ${event}`, { timestamp });
  }
}
