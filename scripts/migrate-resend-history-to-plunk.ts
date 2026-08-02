#!/usr/bin/env node
import path from 'node:path';
import dotenv from 'dotenv';
import { Resend, type ListEmail } from 'resend';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type RecipientHistory = {
  email: string;
  firstSentAt: string;
  lastSentAt: string;
  lastEvent: ListEmail['last_event'];
  messageCount: number;
  shouldSubscribe: boolean;
};

const DO_NOT_SUBSCRIBE_EVENTS = new Set<ListEmail['last_event']>([
  'bounced',
  'complained',
  'suppressed',
]);

function normalizeRecipient(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  if (normalized.endsWith('@guest.yumcut')) return null;
  return normalized;
}

async function loadHistory(resend: Resend): Promise<Map<string, RecipientHistory>> {
  const recipients = new Map<string, RecipientHistory>();
  let after: string | undefined;

  for (;;) {
    const result = await resend.emails.list({ limit: 100, ...(after ? { after } : {}) });
    if (result.error || !result.data) {
      throw new Error(result.error?.message || 'Unable to list Resend emails.');
    }

    for (const message of result.data.data) {
      for (const rawRecipient of message.to) {
        const email = normalizeRecipient(rawRecipient);
        if (!email) continue;

        const existing = recipients.get(email);
        if (!existing) {
          recipients.set(email, {
            email,
            firstSentAt: message.created_at,
            lastSentAt: message.created_at,
            lastEvent: message.last_event,
            messageCount: 1,
            shouldSubscribe: !DO_NOT_SUBSCRIBE_EVENTS.has(message.last_event),
          });
          continue;
        }

        existing.messageCount += 1;
        if (message.created_at < existing.firstSentAt) existing.firstSentAt = message.created_at;
        if (message.created_at > existing.lastSentAt) {
          existing.lastSentAt = message.created_at;
          existing.lastEvent = message.last_event;
        }
        if (DO_NOT_SUBSCRIBE_EVENTS.has(message.last_event)) existing.shouldSubscribe = false;
      }
    }

    if (!result.data.has_more || result.data.data.length === 0) break;
    after = result.data.data.at(-1)?.id;
    if (!after) break;
  }

  return recipients;
}

async function upsertContact(input: RecipientHistory, apiUrl: string, secret: string) {
  const body = JSON.stringify({
    email: input.email,
    ...(!input.shouldSubscribe ? { subscribed: false } : {}),
    data: {
      source: 'resend-history',
      messageCount: input.messageCount,
      firstSentAt: input.firstSentAt,
      lastSentAt: input.lastSentAt,
      lastEvent: input.lastEvent,
    },
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl}/contacts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      if (response.ok) return;
      const responseBody = (await response.text()).slice(0, 500);
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Plunk contact upsert failed (${response.status}): ${responseBody}`);
      }
      if (attempt === 5) {
        throw new Error(`Plunk contact upsert failed after retries (${response.status}): ${responseBody}`);
      }
    } catch (error) {
      if (attempt === 5) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
  }
}

async function runConcurrent<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index]!);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const resendKey = (process.env.RESEND_FULL_ACCESS || process.env.RESEND_API_KEY || '').trim();
  const plunkSecret = (process.env.PLUNK_SECRET_KEY || '').trim();
  const apiUrl = (process.env.PLUNK_API_URL || 'https://mail-api.copymyui.com').replace(/\/$/, '');

  if (!resendKey) throw new Error('RESEND_FULL_ACCESS or RESEND_API_KEY is not configured.');
  if (apply && !plunkSecret) throw new Error('PLUNK_SECRET_KEY is required with --apply.');

  const recipients = await loadHistory(new Resend(resendKey));
  const contacts = [...recipients.values()];
  const unsubscribed = contacts.filter((contact) => !contact.shouldSubscribe).length;

  if (apply) {
    let completed = 0;
    await runConcurrent(contacts, 8, async (contact) => {
      await upsertContact(contact, apiUrl, plunkSecret);
      completed += 1;
      if (completed % 500 === 0) console.log(`Migrated ${completed}/${contacts.length} contacts`);
    });
  }

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    contacts: contacts.length,
    eligible: contacts.length - unsubscribed,
    unsubscribed,
    note: 'Historical messages were mapped to Plunk contacts and were not re-sent.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
