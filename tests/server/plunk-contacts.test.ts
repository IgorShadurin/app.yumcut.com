import { beforeEach, describe, expect, it, vi } from 'vitest';

const isPlunkConfigured = vi.hoisted(() => vi.fn());
const upsertPlunkContact = vi.hoisted(() => vi.fn());
const deletePlunkContactByEmail = vi.hoisted(() => vi.fn());

vi.mock('@/server/emails/plunk', () => ({
  isPlunkConfigured,
  upsertPlunkContact,
  deletePlunkContactByEmail,
}));

const {
  addUserToPlunkContacts,
  normalizePlunkContactEmail,
  removeUserFromPlunkContacts,
} = await import('@/server/emails/plunk-contacts');

beforeEach(() => {
  vi.clearAllMocks();
  isPlunkConfigured.mockReturnValue(true);
  upsertPlunkContact.mockResolvedValue({
    id: 'contact-1',
    email: 'user@example.com',
    subscribed: true,
    _meta: { isNew: true },
  });
  deletePlunkContactByEmail.mockResolvedValue(true);
});

describe('Plunk contact sync', () => {
  it('normalizes real emails and rejects guest emails', () => {
    expect(normalizePlunkContactEmail(' User@Example.COM ')).toBe('user@example.com');
    expect(normalizePlunkContactEmail('guest-1@guest.yumcut')).toBeNull();
    expect(normalizePlunkContactEmail('not-an-email')).toBeNull();
  });

  it('adds real users without overwriting their subscription choice', async () => {
    const result = await addUserToPlunkContacts({
      userId: 'user-1',
      email: 'USER@example.com',
      name: 'Jane Doe',
    });

    expect(result).toEqual({ status: 'created', email: 'user@example.com' });
    expect(upsertPlunkContact).toHaveBeenCalledWith({
      email: 'user@example.com',
      data: {
        userId: 'user-1',
        name: 'Jane Doe',
        source: 'app.yumcut.com',
      },
    });
  });

  it('reports an existing contact from Plunk metadata', async () => {
    upsertPlunkContact.mockResolvedValue({
      id: 'contact-1',
      email: 'user@example.com',
      subscribed: true,
      _meta: { isNew: false, isUpdate: true },
    });

    await expect(addUserToPlunkContacts({ email: 'user@example.com' })).resolves.toEqual({
      status: 'existing',
      email: 'user@example.com',
    });
  });

  it('skips guests, deleted users, and unconfigured environments', async () => {
    await expect(addUserToPlunkContacts({ email: 'guest-1@guest.yumcut' })).resolves.toEqual({
      status: 'skipped',
      reason: 'invalid_or_guest_email',
    });
    await expect(addUserToPlunkContacts({ email: 'real@example.com', deleted: true })).resolves.toEqual({
      status: 'skipped',
      reason: 'deleted_user',
    });
    await expect(addUserToPlunkContacts({ email: 'real@example.com', isGuest: true })).resolves.toEqual({
      status: 'skipped',
      reason: 'guest_user',
    });

    isPlunkConfigured.mockReturnValue(false);
    await expect(addUserToPlunkContacts({ email: 'real@example.com' })).resolves.toEqual({
      status: 'skipped',
      email: 'real@example.com',
      reason: 'plunk_not_configured',
    });
    expect(upsertPlunkContact).not.toHaveBeenCalled();
  });

  it('removes the Plunk contact by normalized email', async () => {
    await expect(removeUserFromPlunkContacts({ email: 'User@example.com' })).resolves.toEqual({
      status: 'removed',
      email: 'user@example.com',
    });
    expect(deletePlunkContactByEmail).toHaveBeenCalledWith('user@example.com');
  });
});
