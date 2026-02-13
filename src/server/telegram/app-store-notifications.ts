import type { AppStoreServerNotification } from '@prisma/client';
import { prisma } from '@/server/db';
import { isTelegramEnabled, sendTelegramMessage } from '@/server/telegram';

const MAX_JSON_SNIPPET = 1600;

const base64UrlDecode = (segment: string) => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const decodeJwsSafe = (jws?: string | null) => {
  if (!jws || typeof jws !== 'string') return null;
  const parts = jws.split('.');
  if (parts.length < 2) return null;
  try {
    const decoded = base64UrlDecode(parts[1]);
    return JSON.parse(decoded);
  } catch (err) {
    console.error('Failed to decode JWS payload from App Store notification', err);
    return null;
  }
};

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatJsonSnippet = (value: unknown) => {
  try {
    const json = JSON.stringify(value, null, 2);
    if (!json) return null;
    if (json.length <= MAX_JSON_SNIPPET) return json;
    return `${json.slice(0, MAX_JSON_SNIPPET)}…`;
  } catch {
    return null;
  }
};

const extractDecodedPayload = (record: AppStoreServerNotification) => {
  if (!record.payload || typeof record.payload !== 'object') return null;
  if ('decodedPayload' in record.payload) {
    return (record.payload as any).decodedPayload ?? null;
  }
  return record.payload;
};

const summarizeTransaction = (decoded: any) => {
  const lines: string[] = [];
  const txPayload = decodeJwsSafe(decoded?.data?.signedTransactionInfo);
  const renewalPayload = decodeJwsSafe(decoded?.data?.signedRenewalInfo);
  const transactionId = txPayload?.transactionId || txPayload?.originalTransactionId;
  if (txPayload?.productId) lines.push(`Product: ${txPayload.productId}`);
  if (transactionId) lines.push(`Transaction: ${transactionId}`);
  if (txPayload?.originalTransactionId && txPayload?.originalTransactionId !== transactionId) {
    lines.push(`Original TX: ${txPayload.originalTransactionId}`);
  }
  if (renewalPayload?.autoRenewProductId) lines.push(`Auto renew product: ${renewalPayload.autoRenewProductId}`);
  if (renewalPayload?.autoRenewStatus !== undefined) {
    lines.push(`Auto renew status: ${renewalPayload.autoRenewStatus}`);
  }
  return lines;
};

export async function notifyAdminsOfAppStoreServerEvent(record: AppStoreServerNotification) {
  if (!isTelegramEnabled()) return;
  const admins = await prisma.telegramAccount.findMany({
    where: { user: { isAdmin: true } },
    select: { chatId: true },
  });
  if (admins.length === 0) return;

  const decoded = extractDecodedPayload(record);
  const lines: string[] = [
    '🍎 App Store server notification',
    `Type: ${record.notificationType || '—'}`,
    `Subtype: ${record.subtype || '—'}`,
    `Environment: ${record.environment || decoded?.data?.environment || '—'}`,
    `DB Entry: ${record.id}`,
  ];

  if (record.notificationUuid) {
    lines.push(`Notification UUID: ${record.notificationUuid}`);
  }

  if (decoded?.data?.eventId) lines.push(`Event ID: ${decoded.data.eventId}`);
  if (decoded?.data?.bundleId) lines.push(`Bundle ID: ${decoded.data.bundleId}`);
  if (decoded?.data?.status) lines.push(`Status: ${decoded.data.status}`);
  if (decoded?.data?.originalTransactionId) {
    lines.push(`Original TX: ${decoded.data.originalTransactionId}`);
  }
  if (decoded?.data?.productId) {
    lines.push(`Product: ${decoded.data.productId}`);
  }

  summarizeTransaction(decoded).forEach((entry) => lines.push(entry));

  const payloadSnippet = formatJsonSnippet(decoded ?? record.payload);
  if (payloadSnippet) {
    lines.push('');
    lines.push('<code>');
    lines.push(escapeHtml(payloadSnippet));
    lines.push('</code>');
  }

  const message = lines.join('\n');
  await Promise.allSettled(
    admins.map(({ chatId }) =>
      sendTelegramMessage(chatId, message, {
        disableWebPagePreview: true,
        disableNotification: true,
        parseMode: payloadSnippet ? 'HTML' : undefined,
      }).catch((err) => {
        console.error('Failed to send App Store notification to admin via Telegram', { chatId, err });
        return false;
      }),
    ),
  );
}
