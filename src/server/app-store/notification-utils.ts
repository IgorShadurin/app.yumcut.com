type AppStoreNotificationRecord = Record<string, unknown> | null | undefined;

export type DecodedAppStoreSignedPayload = {
  notificationType?: string;
  notificationUUID?: string;
  subtype?: string;
  data?: {
    environment?: string;
    notificationUUID?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    originalTransactionId?: string;
    status?: number;
    bundleId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function base64UrlDecode(segment: string) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function decodeAppStoreSignedPayload(signedPayload?: string | null): DecodedAppStoreSignedPayload | null {
  if (!signedPayload || typeof signedPayload !== 'string') {
    return null;
  }
  const segments = signedPayload.split('.');
  if (segments.length < 2) return null;
  try {
    const decoded = base64UrlDecode(segments[1]);
    return JSON.parse(decoded) as DecodedAppStoreSignedPayload;
  } catch (error) {
    console.error('Failed to decode App Store signedPayload', error);
    return null;
  }
}

function normalizeUuid(value?: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function extractNotificationUuid(decoded: DecodedAppStoreSignedPayload | null, bodyRecord: AppStoreNotificationRecord) {
  let bodyValue: string | null = null;
  if (bodyRecord) {
    const candidates: Array<string | null> = [
      typeof bodyRecord['notificationUUID'] === 'string' ? (bodyRecord['notificationUUID'] as string) : null,
      typeof bodyRecord['notificationUuid'] === 'string' ? (bodyRecord['notificationUuid'] as string) : null,
    ];
    bodyValue = candidates.find((value): value is string => typeof value === 'string') ?? null;
  }
  return normalizeUuid(decoded?.notificationUUID || decoded?.data?.notificationUUID || bodyValue);
}
