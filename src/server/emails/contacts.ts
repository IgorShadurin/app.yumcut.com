import { Prisma } from '@prisma/client';
import { config } from '@/server/config';
import { prisma } from '@/server/db';

const GUEST_EMAIL_SUFFIX = '@guest.yumcut';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailContactUserInput = {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  preferredLanguage?: string | null;
  isGuest?: boolean | null;
  deleted?: boolean | null;
};

export type EmailContactSyncResult = {
  status: 'created' | 'existing' | 'skipped';
  email?: string;
  reason?: string;
};

export function emailAudience(): string {
  return config.EMAIL_AUDIENCE?.trim() || 'yumcut';
}

export function normalizeEmailContactAddress(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith(GUEST_EMAIL_SUFFIX)) return null;
  if (!EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

function cleanLanguage(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
  return /^[a-z]{2,8}$/.test(normalized) ? normalized : null;
}

export async function ensureEmailContact(input: {
  email: string;
  userId?: string | null;
  name?: string | null;
  preferredLanguage?: string | null;
  subscribedOnCreate?: boolean;
  consentSource?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const email = normalizeEmailContactAddress(input.email);
  if (!email) throw new Error('A valid non-guest email is required for an email contact.');

  const audience = emailAudience();
  const subscribedOnCreate = input.subscribedOnCreate ?? false;
  const now = new Date();
  const language = cleanLanguage(input.preferredLanguage);

  return prisma.emailContact.upsert({
    where: { audience_email: { audience, email } },
    update: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.name?.trim() ? { name: input.name.trim().slice(0, 191) } : {}),
        ...(language ? { preferredLanguage: language } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
    create: {
      audience,
      email,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.name?.trim() ? { name: input.name.trim().slice(0, 191) } : {}),
      ...(language ? { preferredLanguage: language } : {}),
      marketingSubscribed: subscribedOnCreate,
      subscribedAt: subscribedOnCreate ? now : null,
      unsubscribedAt: subscribedOnCreate ? null : now,
      consentSource: input.consentSource?.trim().slice(0, 64) || null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

export async function addUserToEmailContacts(input: EmailContactUserInput): Promise<EmailContactSyncResult> {
  if (input.deleted) return { status: 'skipped', reason: 'deleted_user' };
  if (input.isGuest) return { status: 'skipped', reason: 'guest_user' };

  const email = normalizeEmailContactAddress(input.email);
  if (!email) return { status: 'skipped', reason: 'invalid_or_guest_email' };
  const audience = emailAudience();
  const existing = await prisma.emailContact.findUnique({
    where: { audience_email: { audience, email } },
    select: { id: true },
  });

  await ensureEmailContact({
    email,
    userId: input.userId,
    name: input.name,
    preferredLanguage: input.preferredLanguage,
    subscribedOnCreate: true,
    consentSource: 'user-registration',
  });

  return { status: existing ? 'existing' : 'created', email };
}

export async function findEmailContactByPreferenceToken(token: string) {
  const normalized = token.trim();
  if (!/^[a-f0-9-]{36}$/i.test(normalized)) return null;
  return prisma.emailContact.findFirst({
    where: {
      audience: emailAudience(),
      OR: [
        { preferenceToken: normalized },
        { legacyPreferenceToken: normalized },
      ],
    },
  });
}

export async function setEmailMarketingSubscription(token: string, subscribed: boolean) {
  const contact = await findEmailContactByPreferenceToken(token);
  if (!contact) return { status: 'not_found' as const };
  if (subscribed && contact.suppressedAt) {
    return { status: 'suppressed' as const, contact };
  }

  const now = new Date();
  const updated = await prisma.emailContact.update({
    where: { id: contact.id },
    data: {
      marketingSubscribed: subscribed,
      subscribedAt: subscribed ? now : contact.subscribedAt,
      unsubscribedAt: subscribed ? null : now,
      consentSource: subscribed ? 'preferences-page' : 'unsubscribe',
    },
  });
  return { status: subscribed ? 'subscribed' as const : 'unsubscribed' as const, contact: updated };
}

export async function suppressEmailContact(input: {
  email: string;
  reason: string;
  details?: string | null;
}) {
  const contact = await ensureEmailContact({
    email: input.email,
    subscribedOnCreate: false,
    consentSource: 'delivery-suppression',
  });
  const now = new Date();
  return prisma.emailContact.update({
    where: { id: contact.id },
    data: {
      marketingSubscribed: false,
      unsubscribedAt: contact.unsubscribedAt ?? now,
      suppressedAt: contact.suppressedAt ?? now,
      suppressionReason: input.reason.slice(0, 64),
      suppressionDetails: input.details?.trim().slice(0, 512) || null,
    },
  });
}

export function addUserToEmailContactsInBackground(input: EmailContactUserInput, context: string) {
  addUserToEmailContacts(input).catch((err) => {
    console.error('Failed to add user to local email contacts', {
      context,
      userId: input.userId,
      email: input.email,
      err,
    });
  });
}
