import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  grantTokens: vi.fn(),
  sendLocalized: vi.fn(),
}));

vi.mock('@/server/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/server/tokens', () => ({
  grantTokens: mocks.grantTokens,
  makeSystemInitiator: (tag: string) => `system:${tag}`,
}));

vi.mock('@/server/config', () => ({
  config: {
    EMAIL_SEND_PROVIDER: 'resend',
    RESEND_FROM_EMAIL: 'YumCut <support@yumcut.com>',
    RESEND_MARKETING_REPLY_TO_EMAIL: 'support@yumcut.com',
    NEXTAUTH_SECRET: 'test-secret-for-reply-bonus',
  },
}));

vi.mock('@/server/emails/planned', async () => {
  const actual = await vi.importActual<typeof import('@/server/emails/planned')>('@/server/emails/planned');
  return { ...actual, sendLocalizedPlainTextEmail: mocks.sendLocalized };
});

const { processInboundReplyBonus } = await import('@/server/emails/reply-bonus');

describe('Resend marketing reply bonus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grantTokens.mockResolvedValue(130);
    mocks.sendLocalized.mockResolvedValue({ ok: true, id: 'confirmation-1', language: 'en' });
    mocks.transaction.mockImplementation(async (callback: any) => callback({
      user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tokenTransaction: { create: vi.fn() },
    }));
  });

  it('matches a reply by sender after a Resend welcome Automation was sent', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      name: 'Max',
      preferredLanguage: 'en',
      deleted: false,
      emailReplyBonusGrantedAt: null,
      plannedEmails: [{ id: 'planned-welcome-1' }],
    });

    const result = await processInboundReplyBonus({
      from: 'User <user@example.com>',
      to: ['support@yumcut.com'],
      emailId: 'received-1',
    });

    expect(mocks.userFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'user@example.com' },
    }));
    expect(result).toEqual(expect.objectContaining({
      granted: true,
      userMatched: true,
      userId: '11111111-1111-1111-1111-111111111111',
    }));
  });

  it('does not grant through the generic address without a sent welcome email', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      name: 'Max',
      preferredLanguage: 'en',
      deleted: false,
      emailReplyBonusGrantedAt: null,
      plannedEmails: [],
    });

    const result = await processInboundReplyBonus({
      from: 'user@example.com',
      to: ['support@yumcut.com'],
      emailId: 'received-2',
    });

    expect(result).toEqual(expect.objectContaining({
      eligible: false,
      granted: false,
      reason: 'no_signed_recipient',
    }));
    expect(mocks.grantTokens).not.toHaveBeenCalled();
  });
});
