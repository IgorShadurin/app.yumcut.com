import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { config } from '@/server/config';
import { prisma } from '@/server/db';
import { renderEmailContent } from '@/server/emails/content';
import {
  ensureEmailContact,
  normalizeEmailContactAddress,
  suppressEmailContact,
} from '@/server/emails/contacts';

const DEFAULT_PREFERENCES_URL = 'https://mail.yumcut.com';

export type SendPostalEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  marketing?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

export type PostalSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
  reason?: 'unsubscribed' | 'suppressed';
};

type PostalResponse = {
  status?: 'success' | 'error';
  data?: { message_id?: string; code?: string; message?: string };
};

export type PostalWebhookEnvelope = {
  event?: string;
  timestamp?: number;
  uuid?: string;
  payload?: {
    message?: { id?: number | string; to?: string };
    original_message?: { id?: number | string; to?: string };
    details?: string;
  };
};

function requiredConfig(name: 'POSTAL_API_URL' | 'POSTAL_API_KEY' | 'POSTAL_FROM_EMAIL'): string {
  const value = config[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function sendEndpoint(): string {
  const value = requiredConfig('POSTAL_API_URL').replace(/\/$/, '');
  const parsed = new URL(value);
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('POSTAL_API_URL must use HTTPS in production.');
  }
  if (parsed.pathname.endsWith('/api/v1/send/message')) return value;
  if (parsed.pathname.endsWith('/api/v1/send')) return `${value}/message`;
  if (parsed.pathname.endsWith('/api/v1')) return `${value}/send/message`;
  return `${value}/api/v1/send/message`;
}

function preferencesUrl(): string {
  return (config.EMAIL_PREFERENCES_URL?.trim() || DEFAULT_PREFERENCES_URL).replace(/\/$/, '');
}

function assertMailbox(value: string, label: string): string {
  const trimmed = value.trim();
  if (/[\r\n]/.test(trimmed)) throw new Error(`${label} contains an invalid line break.`);
  const address = trimmed.match(/^\s*(?:[^<>]+\s*)?<([^<>\s]+@[^<>\s]+)>\s*$/)?.[1] ?? trimmed;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error(`${label} must be an email address or "Name <email@example.com>".`);
  }
  return trimmed;
}

function mailboxAddress(value: string): string {
  return value.match(/^\s*(?:[^<>]+\s*)?<([^<>\s]+@[^<>\s]+)>\s*$/)?.[1] ?? value;
}

function stringifyError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}

function validatedHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => {
    if (!/^[A-Za-z0-9-]+$/.test(name) || /[\r\n]/.test(value)) throw new Error('Postal custom header is invalid.');
    return [name, value];
  }));
}

function webhookPublicKey(): string {
  const configured = config.POSTAL_WEBHOOK_PUBLIC_KEY?.trim();
  if (!configured) throw new Error('POSTAL_WEBHOOK_PUBLIC_KEY is not configured.');
  if (configured.includes('BEGIN PUBLIC KEY')) return configured.replace(/\\n/g, '\n');
  const decoded = Buffer.from(configured, 'base64').toString('utf8').trim();
  if (!decoded.includes('BEGIN PUBLIC KEY')) {
    throw new Error('POSTAL_WEBHOOK_PUBLIC_KEY must be PEM text or base64-encoded PEM text.');
  }
  return decoded;
}

export function verifyPostalWebhook(rawBody: string, headers: Headers): PostalWebhookEnvelope | null {
  const signature = headers.get('x-postal-signature-256');
  if (!signature) return null;
  try {
    if (!crypto.verify('RSA-SHA256', Buffer.from(rawBody), webhookPublicKey(), Buffer.from(signature, 'base64'))) {
      return null;
    }
    return JSON.parse(rawBody) as PostalWebhookEnvelope;
  } catch {
    return null;
  }
}

export async function recordPostalWebhook(envelope: PostalWebhookEnvelope): Promise<{
  handled: boolean;
  duplicate?: boolean;
}> {
  const event = envelope.event?.trim() || 'Unknown';
  const providerEventId = envelope.uuid?.trim();
  if (!providerEventId) return { handled: false };

  const rawRecipient = event === 'MessageBounced'
    ? envelope.payload?.original_message?.to
    : envelope.payload?.message?.to;
  const recipient = normalizeEmailContactAddress(rawRecipient);
  const rawMessageId = envelope.payload?.message?.id ?? envelope.payload?.original_message?.id;
  const messageId = rawMessageId === undefined ? null : String(rawMessageId).slice(0, 191);
  const details = envelope.payload?.details?.trim().slice(0, 512) || null;

  try {
    await prisma.emailDeliveryEvent.create({
      data: {
        provider: 'postal',
        providerEventId,
        eventType: event.slice(0, 64),
        recipient,
        messageId,
        details,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      if (recipient && ['MessageBounced', 'MessageDeliveryFailed'].includes(event)) {
        await suppressEmailContact({ email: recipient, reason: event, details });
      }
      return { handled: true, duplicate: true };
    }
    throw error;
  }

  if (recipient && ['MessageBounced', 'MessageDeliveryFailed'].includes(event)) {
    await suppressEmailContact({ email: recipient, reason: event, details });
  }
  return { handled: true };
}

async function sendPostalEmailInternal(
  input: SendPostalEmailInput,
  allowUnsubscribedMarketingTest: boolean,
): Promise<PostalSendResult> {
  const marketing = input.marketing ?? false;

  try {
    const to = assertMailbox(input.to, 'Postal recipient');
    const recipient = mailboxAddress(to).toLowerCase();
    const from = assertMailbox(requiredConfig('POSTAL_FROM_EMAIL'), 'POSTAL_FROM_EMAIL');
    const replyTo = input.replyTo ? assertMailbox(input.replyTo, 'Postal reply-to') : null;
    if (/[\r\n]/.test(input.subject)) throw new Error('Postal subject contains an invalid line break.');

    const contact = await ensureEmailContact({
      email: recipient,
      subscribedOnCreate: false,
      consentSource: marketing ? 'marketing-send' : 'transactional-send',
    });
    if (contact.suppressedAt) {
      return { ok: true, skipped: true, reason: 'suppressed', id: contact.id };
    }
    if (marketing && !contact.marketingSubscribed && !allowUnsubscribedMarketingTest) {
      return { ok: true, skipped: true, reason: 'unsubscribed', id: contact.id };
    }

    const content = renderEmailContent({
      text: input.text,
      marketing,
      contactId: marketing ? contact.preferenceToken : undefined,
      preferencesOrigin: preferencesUrl(),
    });
    const headers = {
      ...content.headers,
      ...validatedHeaders(input.headers),
      ...(input.idempotencyKey ? { 'X-YumCut-Idempotency-Key': input.idempotencyKey } : {}),
    };

    const response = await fetch(sendEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': requiredConfig('POSTAL_API_KEY') },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        to: [to],
        from,
        subject: input.subject,
        tag: marketing ? 'yumcut-marketing' : 'yumcut-transactional',
        ...(replyTo ? { reply_to: replyTo } : {}),
        plain_body: content.text,
        html_body: content.html,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });

    const raw = await response.text();
    let parsed: PostalResponse | null = null;
    try { parsed = raw ? JSON.parse(raw) as PostalResponse : null; } catch { parsed = null; }
    if (!response.ok || parsed?.status !== 'success' || !parsed.data?.message_id) {
      const detail = parsed?.data?.message || parsed?.data?.code || raw || `HTTP ${response.status}`;
      return { ok: false, error: `Postal send failed: ${String(detail).slice(0, 3_900)}` };
    }
    return { ok: true, id: parsed.data.message_id };
  } catch (error) {
    return { ok: false, error: stringifyError(error) };
  }
}

export function sendPostalEmail(input: SendPostalEmailInput): Promise<PostalSendResult> {
  return sendPostalEmailInternal(input, false);
}

export function sendPostalMarketingTestEmail(
  input: Omit<SendPostalEmailInput, 'marketing'>,
): Promise<PostalSendResult> {
  return sendPostalEmailInternal({ ...input, marketing: true }, true);
}
