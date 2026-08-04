#!/usr/bin/env node
import path from 'node:path';
import dotenv from 'dotenv';
import { prisma } from '../src/server/db';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type PlunkContact = {
  id: string;
  email: string;
  subscribed?: boolean;
  data?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

type PlunkPage = { data: PlunkContact[]; cursor?: string | null; hasMore?: boolean; total?: number };

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@guest.yumcut') ? email : null;
}

function asDate(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function loadContacts(apiUrl: string, secret: string): Promise<PlunkContact[]> {
  const contacts: PlunkContact[] = [];
  let cursor: string | undefined;
  for (;;) {
    const url = new URL(`${apiUrl}/contacts`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Plunk contact list failed with HTTP ${response.status}.`);
    const page = await response.json() as PlunkPage;
    contacts.push(...(Array.isArray(page.data) ? page.data : []));
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }
  return contacts;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const apiUrl = (process.env.PLUNK_API_URL || '').trim().replace(/\/$/, '');
  const secret = (process.env.PLUNK_SECRET_KEY || '').trim();
  const audience = (process.env.EMAIL_AUDIENCE || 'yumcut').trim();
  if (!apiUrl || !secret) throw new Error('Temporary PLUNK_API_URL and PLUNK_SECRET_KEY are required.');

  const source = await loadContacts(apiUrl, secret);
  const contacts = source.flatMap((item) => {
    const email = normalizeEmail(item.email);
    return email ? [{ ...item, email }] : [];
  });
  let created = 0;
  let updated = 0;
  let keptUnsubscribed = 0;

  if (apply) {
    for (const sourceContact of contacts) {
      const existing = await prisma.emailContact.findUnique({
        where: { audience_email: { audience, email: sourceContact.email } },
      });
      const user = await prisma.user.findUnique({
        where: { email: sourceContact.email },
        select: { id: true, name: true, preferredLanguage: true },
      });
      const sourceSubscribed = sourceContact.subscribed !== false;
      const marketingSubscribed = existing ? existing.marketingSubscribed && sourceSubscribed : sourceSubscribed;
      if (!marketingSubscribed) keptUnsubscribed += 1;
      const changedAt = asDate(sourceContact.updatedAt ?? sourceContact.createdAt);
      const validLegacyId = /^[a-f0-9-]{36}$/i.test(sourceContact.id) ? sourceContact.id : null;
      const data = {
        ...(user ? { userId: user.id, name: user.name, preferredLanguage: user.preferredLanguage } : {}),
        marketingSubscribed,
        subscribedAt: marketingSubscribed ? (existing?.subscribedAt ?? changedAt) : existing?.subscribedAt,
        unsubscribedAt: marketingSubscribed ? null : (existing?.unsubscribedAt ?? changedAt),
        consentSource: 'plunk-import',
        metadata: { source: 'plunk-import', ...(sourceContact.data ?? {}) },
      };

      if (existing) {
        await prisma.emailContact.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(!existing.legacyPreferenceToken && validLegacyId && existing.preferenceToken !== validLegacyId
              ? { legacyPreferenceToken: validLegacyId }
              : {}),
          },
        });
        updated += 1;
      } else {
        await prisma.emailContact.create({
          data: {
            audience,
            email: sourceContact.email,
            ...(validLegacyId ? { preferenceToken: validLegacyId } : {}),
            ...data,
          },
        });
        created += 1;
      }
    }
  }

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    audience,
    sourceContacts: source.length,
    validContacts: contacts.length,
    created,
    updated,
    keptUnsubscribed,
    note: 'No messages were sent. Existing local opt-outs were never changed to subscribed.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
