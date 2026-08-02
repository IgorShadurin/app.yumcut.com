import {
  deletePlunkContactByEmail,
  isPlunkConfigured,
  upsertPlunkContact,
} from '@/server/emails/plunk';

const GUEST_EMAIL_SUFFIX = '@guest.yumcut';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PlunkContactUserInput = {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  isGuest?: boolean | null;
  deleted?: boolean | null;
};

export type PlunkContactSyncResult = {
  status: 'created' | 'existing' | 'removed' | 'not_found' | 'skipped';
  email?: string;
  reason?: string;
};

export function normalizePlunkContactEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith(GUEST_EMAIL_SUFFIX)) return null;
  if (!EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
}

export async function addUserToPlunkContacts(input: PlunkContactUserInput): Promise<PlunkContactSyncResult> {
  if (input.deleted) return { status: 'skipped', reason: 'deleted_user' };
  if (input.isGuest) return { status: 'skipped', reason: 'guest_user' };

  const email = normalizePlunkContactEmail(input.email);
  if (!email) return { status: 'skipped', reason: 'invalid_or_guest_email' };
  if (!isPlunkConfigured()) return { status: 'skipped', email, reason: 'plunk_not_configured' };

  const contact = await upsertPlunkContact({
    email,
    data: {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      source: 'app.yumcut.com',
    },
  });

  return {
    status: contact._meta?.isNew ? 'created' : 'existing',
    email,
  };
}

export async function removeUserFromPlunkContacts(input: PlunkContactUserInput): Promise<PlunkContactSyncResult> {
  const email = normalizePlunkContactEmail(input.email);
  if (!email) return { status: 'skipped', reason: 'invalid_or_guest_email' };
  if (!isPlunkConfigured()) return { status: 'skipped', email, reason: 'plunk_not_configured' };

  const removed = await deletePlunkContactByEmail(email);
  return {
    status: removed ? 'removed' : 'not_found',
    email,
    ...(removed ? {} : { reason: 'contact_not_found' }),
  };
}

export function addUserToPlunkContactsInBackground(input: PlunkContactUserInput, context: string) {
  addUserToPlunkContacts(input).catch((err) => {
    console.error('Failed to add user email to Plunk contacts', {
      context,
      userId: input.userId,
      email: input.email,
      err,
    });
  });
}

export function removeUserFromPlunkContactsInBackground(input: PlunkContactUserInput, context: string) {
  removeUserFromPlunkContacts(input).catch((err) => {
    console.error('Failed to remove user email from Plunk contacts', {
      context,
      userId: input.userId,
      email: input.email,
      err,
    });
  });
}
