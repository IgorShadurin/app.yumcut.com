import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: { EMAIL_AUDIENCE: 'yumcut' },
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/db', () => ({ prisma: { emailContact: {
  findUnique: state.findUnique,
  findFirst: state.findFirst,
  upsert: state.upsert,
  update: state.update,
  deleteMany: state.deleteMany,
} } }));

const { ensureEmailContact, normalizeEmailContactAddress, setEmailMarketingSubscription } = await import('@/server/emails/contacts');

beforeEach(() => { vi.clearAllMocks(); });

describe('local email contacts', () => {
  it('normalizes addresses and excludes guest identities', () => {
    expect(normalizeEmailContactAddress(' User@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmailContactAddress('guest-1@guest.yumcut')).toBeNull();
    expect(normalizeEmailContactAddress('invalid')).toBeNull();
  });

  it('creates unknown delivery recipients unsubscribed by default', async () => {
    state.upsert.mockResolvedValue({ id: 'contact-1' });
    await ensureEmailContact({ email: 'User@example.com', consentSource: 'transactional-send' });
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { audience_email: { audience: 'yumcut', email: 'user@example.com' } },
      create: expect.objectContaining({ marketingSubscribed: false, consentSource: 'transactional-send' }),
      update: {},
    }));
  });

  it('never changes subscription state while refreshing an existing contact', async () => {
    state.upsert.mockResolvedValue({ id: 'contact-1', marketingSubscribed: false });
    await ensureEmailContact({ email: 'user@example.com', subscribedOnCreate: true, name: 'User' });
    expect(state.upsert.mock.calls[0]?.[0]?.update).toEqual({ name: 'User' });
  });

  it('recovers when another request creates the same contact concurrently', async () => {
    const contact = { id: 'contact-1', email: 'user@example.com' };
    state.upsert.mockRejectedValue({
      code: 'P2002',
      meta: { target: 'EmailContact_audience_email_key' },
    });
    state.update.mockResolvedValue(contact);

    await expect(ensureEmailContact({
      email: 'User@example.com',
      userId: 'user-1',
      name: 'User',
      subscribedOnCreate: true,
    })).resolves.toEqual(contact);

    expect(state.update).toHaveBeenCalledWith({
      where: { audience_email: { audience: 'yumcut', email: 'user@example.com' } },
      data: { userId: 'user-1', name: 'User' },
    });
  });

  it('does not hide unrelated upsert failures', async () => {
    const error = { code: 'P2002', meta: { target: 'EmailContact_preferenceToken_key' } };
    state.upsert.mockRejectedValue(error);

    await expect(ensureEmailContact({ email: 'user@example.com' })).rejects.toBe(error);
    expect(state.update).not.toHaveBeenCalled();
  });

  it('does not re-enable a hard-suppressed address', async () => {
    const contact = { id: 'contact-1', email: 'user@example.com', suppressedAt: new Date(), marketingSubscribed: false };
    state.findFirst.mockResolvedValue(contact);
    await expect(setEmailMarketingSubscription('11111111-1111-4111-8111-111111111111', true))
      .resolves.toEqual({ status: 'suppressed', contact });
    expect(state.update).not.toHaveBeenCalled();
  });
});
