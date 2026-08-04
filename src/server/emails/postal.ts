import { config } from '@/server/config';
import { renderEmailContent } from '@/server/emails/content';
import { upsertPlunkContact } from '@/server/emails/plunk';
import crypto from 'node:crypto';

const DEFAULT_PREFERENCES_URL = 'https://mail.yumcut.com';

export type SendPostalEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  marketing?: boolean;
  idempotencyKey?: string;
};

export type PostalSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
  reason?: 'unsubscribed';
};

type PostalResponse = {
  status?: 'success' | 'error';
  data?: {
    message_id?: string;
    code?: string;
    message?: string;
    messages?: Record<string, { id?: number; token?: string }>;
  };
};

export type PostalWebhookEnvelope = {
  event?: string;
  timestamp?: number;
  uuid?: string;
  payload?: {
    message?: { to?: string };
    original_message?: { to?: string };
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
  return (config.PLUNK_PREFERENCES_URL?.trim() || DEFAULT_PREFERENCES_URL).replace(/\/$/, '');
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

function stringifyError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
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
    const valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(rawBody),
      webhookPublicKey(),
      Buffer.from(signature, 'base64'),
    );
    if (!valid) return null;
    return JSON.parse(rawBody) as PostalWebhookEnvelope;
  } catch {
    return null;
  }
}

export async function suppressPostalFailureInPlunk(envelope: PostalWebhookEnvelope): Promise<{
  handled: boolean;
  email?: string;
}> {
  if (!['MessageBounced', 'MessageDeliveryFailed'].includes(envelope.event ?? '')) {
    return { handled: false };
  }

  const email = envelope.event === 'MessageBounced'
    ? envelope.payload?.original_message?.to?.trim().toLowerCase()
    : envelope.payload?.message?.to?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { handled: false };
  }

  await upsertPlunkContact({
    email,
    subscribed: false,
    data: {
      source: 'app.yumcut.com',
      delivery_provider: 'postal',
      suppression_reason: envelope.event,
    },
  });
  return { handled: true, email };
}

async function syncTransactionalContact(email: string): Promise<void> {
  if (!config.PLUNK_SECRET_KEY?.trim()) return;
  try {
    await upsertPlunkContact({
      email,
      data: { source: 'app.yumcut.com', delivery_provider: 'postal' },
    });
  } catch (error) {
    console.error('Failed to synchronize Postal recipient with Plunk', {
      email,
      error: stringifyError(error),
    });
  }
}

export async function sendPostalEmail(input: SendPostalEmailInput): Promise<PostalSendResult> {
  const marketing = input.marketing ?? false;

  try {
    const to = assertMailbox(input.to, 'Postal recipient');
    const from = assertMailbox(requiredConfig('POSTAL_FROM_EMAIL'), 'POSTAL_FROM_EMAIL');
    const replyTo = input.replyTo ? assertMailbox(input.replyTo, 'Postal reply-to') : null;
    if (/[\r\n]/.test(input.subject)) {
      throw new Error('Postal subject contains an invalid line break.');
    }

    let contactId: string | undefined;
    if (marketing) {
      if (!config.PLUNK_SECRET_KEY?.trim()) {
        throw new Error('PLUNK_SECRET_KEY is required for Postal marketing consent and unsubscribe links.');
      }
      const contact = await upsertPlunkContact({
        email: to,
        data: { source: 'app.yumcut.com', delivery_provider: 'postal' },
      });
      contactId = contact.id;
      if (!contact.subscribed) {
        return { ok: true, skipped: true, reason: 'unsubscribed', id: contact.id };
      }
    } else {
      await syncTransactionalContact(to);
    }

    const content = renderEmailContent({
      text: input.text,
      marketing,
      contactId,
      preferencesOrigin: preferencesUrl(),
    });
    const headers = {
      ...content.headers,
      ...(input.idempotencyKey ? { 'X-YumCut-Idempotency-Key': input.idempotencyKey } : {}),
    };

    const response = await fetch(sendEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Server-API-Key': requiredConfig('POSTAL_API_KEY'),
      },
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
    try {
      parsed = raw ? JSON.parse(raw) as PostalResponse : null;
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.status !== 'success' || !parsed.data?.message_id) {
      const detail = parsed?.data?.message || parsed?.data?.code || raw || `HTTP ${response.status}`;
      return { ok: false, error: `Postal send failed: ${String(detail).slice(0, 3_900)}` };
    }

    return { ok: true, id: parsed.data.message_id };
  } catch (error) {
    return { ok: false, error: stringifyError(error) };
  }
}
