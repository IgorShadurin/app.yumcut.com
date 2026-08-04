#!/usr/bin/env node
import path from 'node:path';
import dotenv from 'dotenv';
import { Resend, type ListEmail } from 'resend';
import { prisma } from '../src/server/db';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type RecipientHistory = { email: string; firstSentAt: string; lastSentAt: string; lastEvent: ListEmail['last_event']; messageCount: number; suppressed: boolean };
const SUPPRESSION_EVENTS = new Set<ListEmail['last_event']>(['bounced', 'complained', 'suppressed']);

async function loadHistory(resend: Resend): Promise<Map<string, RecipientHistory>> {
  const recipients = new Map<string, RecipientHistory>();
  let after: string | undefined;
  for (;;) {
    const result = await resend.emails.list({ limit: 100, ...(after ? { after } : {}) });
    if (result.error || !result.data) throw new Error(result.error?.message || 'Unable to list Resend emails.');
    for (const message of result.data.data) {
      for (const value of message.to) {
        const email = value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@guest.yumcut')) continue;
        const existing = recipients.get(email);
        if (!existing) {
          recipients.set(email, { email, firstSentAt: message.created_at, lastSentAt: message.created_at, lastEvent: message.last_event, messageCount: 1, suppressed: SUPPRESSION_EVENTS.has(message.last_event) });
        } else {
          existing.messageCount += 1;
          if (message.created_at < existing.firstSentAt) existing.firstSentAt = message.created_at;
          if (message.created_at > existing.lastSentAt) { existing.lastSentAt = message.created_at; existing.lastEvent = message.last_event; }
          existing.suppressed ||= SUPPRESSION_EVENTS.has(message.last_event);
        }
      }
    }
    if (!result.data.has_more || result.data.data.length === 0) break;
    after = result.data.data.at(-1)?.id;
    if (!after) break;
  }
  return recipients;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const key = (process.env.RESEND_FULL_ACCESS || process.env.RESEND_API_KEY || '').trim();
  const audience = (process.env.EMAIL_AUDIENCE || 'yumcut').trim();
  if (!key) throw new Error('RESEND_FULL_ACCESS or RESEND_API_KEY is required.');
  const contacts = [...(await loadHistory(new Resend(key))).values()];
  let created = 0;
  let updated = 0;
  if (apply) {
    for (const item of contacts) {
      const existing = await prisma.emailContact.findUnique({ where: { audience_email: { audience, email: item.email } } });
      const now = new Date();
      const data = {
        metadata: { source: 'resend-history', messageCount: item.messageCount, firstSentAt: item.firstSentAt, lastSentAt: item.lastSentAt, lastEvent: item.lastEvent },
        ...(item.suppressed ? { marketingSubscribed: false, unsubscribedAt: existing?.unsubscribedAt ?? now, suppressedAt: existing?.suppressedAt ?? now, suppressionReason: `resend-${item.lastEvent}` } : {}),
      };
      if (existing) { await prisma.emailContact.update({ where: { id: existing.id }, data }); updated += 1; }
      else { await prisma.emailContact.create({ data: { audience, email: item.email, marketingSubscribed: false, unsubscribedAt: now, consentSource: 'resend-history', ...data } }); created += 1; }
    }
  }
  console.log(JSON.stringify({ ok: true, mode: apply ? 'apply' : 'dry-run', contacts: contacts.length, suppressed: contacts.filter((item) => item.suppressed).length, created, updated, note: 'No messages were sent and historical delivery alone was not treated as marketing consent.' }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
