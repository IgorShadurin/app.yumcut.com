import { config } from '@/server/config';

const DEFAULT_PLUNK_API_URL = 'https://mail-api.copymyui.com';
const DEFAULT_PREFERENCES_URL = 'https://mail.yumcut.com';

export type PlunkContact = {
  id: string;
  email: string;
  subscribed: boolean;
  data?: Record<string, unknown> | null;
  _meta?: {
    isNew?: boolean;
    isUpdate?: boolean;
  };
};

export type PlunkSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
  reason?: 'unsubscribed';
};

export type SendPlunkEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  marketing?: boolean;
  headers?: Record<string, string>;
  data?: Record<string, unknown>;
  idempotencyKey?: string;
};

type PlunkListResponse<T> = {
  data?: T[];
};

function apiUrl(): string {
  return (config.PLUNK_API_URL?.trim() || DEFAULT_PLUNK_API_URL).replace(/\/$/, '');
}

function preferencesUrl(): string {
  return (config.PLUNK_PREFERENCES_URL?.trim() || DEFAULT_PREFERENCES_URL).replace(/\/$/, '');
}

function secretKey(): string {
  const value = config.PLUNK_SECRET_KEY?.trim();
  if (!value) {
    throw new Error('PLUNK_SECRET_KEY is not configured.');
  }
  return value;
}

function parseConfiguredSender(): { name?: string; email: string } {
  const configured = config.PLUNK_FROM_EMAIL?.trim();
  if (!configured) {
    throw new Error('PLUNK_FROM_EMAIL is not configured.');
  }

  const match = configured.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (match) {
    const name = match[1]?.trim().replace(/^['"]|['"]$/g, '');
    return {
      ...(name ? { name } : {}),
      email: match[2]!.trim().toLowerCase(),
    };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured)) {
    return { email: configured.toLowerCase() };
  }

  throw new Error('PLUNK_FROM_EMAIL must be an email address or "Name <email@example.com>".');
}

export function isPlunkConfigured(): boolean {
  return Boolean(config.PLUNK_SECRET_KEY?.trim() && config.PLUNK_FROM_EMAIL?.trim());
}

async function plunkRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${secretKey()}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!response.ok) {
    const message = typeof parsed === 'object' && parsed !== null
      ? String((parsed as { message?: unknown; error?: unknown }).message
        ?? (parsed as { error?: unknown }).error
        ?? `Plunk request failed with ${response.status}`)
      : String(parsed || `Plunk request failed with ${response.status}`);
    throw new Error(message);
  }

  return parsed as T;
}

export async function upsertPlunkContact(input: {
  email: string;
  data?: Record<string, unknown>;
  subscribed?: boolean;
}): Promise<PlunkContact> {
  return plunkRequest<PlunkContact>('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      ...(input.data && Object.keys(input.data).length > 0 ? { data: input.data } : {}),
      ...(typeof input.subscribed === 'boolean' ? { subscribed: input.subscribed } : {}),
    }),
  });
}

export async function findPlunkContactByEmail(email: string): Promise<PlunkContact | null> {
  const response = await plunkRequest<PlunkListResponse<PlunkContact>>(
    `/contacts?search=${encodeURIComponent(email)}&limit=100`,
  );
  const normalized = email.trim().toLowerCase();
  return response.data?.find((contact) => contact.email.trim().toLowerCase() === normalized) ?? null;
}

export async function deletePlunkContactByEmail(email: string): Promise<boolean> {
  const contact = await findPlunkContactByEmail(email);
  if (!contact) return false;
  await plunkRequest<unknown>(`/contacts/${encodeURIComponent(contact.id)}`, { method: 'DELETE' });
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyEscapedText(value: string): string {
  return value.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const trailing = match.match(/[),.;!?]+$/)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `<a href="${url}" style="color:#c2410c">${url}</a>${trailing}`;
  });
}

function renderTextEmail(text: string, contactId: string, marketing: boolean): string {
  const paragraphs = escapeHtml(text.trim())
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px">${linkifyEscapedText(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const preferencesFooter = marketing
    ? `<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">You can <a href="${preferencesUrl()}/man&#97;ge/${contactId}" style="color:#6b7280">manage email preferences</a> or <a href="${preferencesUrl()}/unsub&#115;cribe/${contactId}" style="color:#6b7280">unsubscribe</a>.</div>`
    : '';

  return `<div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#172033">${paragraphs}${preferencesFooter}</div>`;
}

function stringifyError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}

export async function sendPlunkEmail(input: SendPlunkEmailInput): Promise<PlunkSendResult> {
  const marketing = input.marketing ?? false;

  try {
    const contact = await upsertPlunkContact({
      email: input.to,
      data: input.data,
    });

    if (marketing && !contact.subscribed) {
      return {
        ok: true,
        skipped: true,
        reason: 'unsubscribed',
        id: contact.id,
      };
    }

    const sender = parseConfiguredSender();
    const unsubscribeUrl = `${preferencesUrl()}/unsubscribe/${contact.id}`;
    const headers: Record<string, string> = {
      ...(input.headers ?? {}),
      ...(marketing
        ? {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : {}),
    };

    const response = await plunkRequest<{
      success?: boolean;
      data?: { emails?: Array<{ email?: string }> };
    }>('/v1/send', {
      method: 'POST',
      headers: {
        ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        body: renderTextEmail(input.text, contact.id, marketing),
        from: sender,
        ...(input.replyTo ? { reply: input.replyTo } : {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(input.data && Object.keys(input.data).length > 0 ? { data: input.data } : {}),
      }),
    });

    const emailId = response.data?.emails?.[0]?.email;
    if (!response.success || !emailId) {
      return { ok: false, error: 'Plunk did not return a sent email ID.' };
    }

    return { ok: true, id: emailId };
  } catch (error) {
    return { ok: false, error: stringifyError(error) };
  }
}
