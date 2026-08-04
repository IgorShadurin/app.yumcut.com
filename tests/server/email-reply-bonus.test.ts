import { beforeEach, describe, expect, it, vi } from 'vitest';

const userFindUnique = vi.hoisted(() => vi.fn());
const prismaTransaction = vi.hoisted(() => vi.fn());
const grantTokens = vi.hoisted(() => vi.fn());
const sendLocalizedPlainTextEmail = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
    },
    $transaction: prismaTransaction,
  },
}));

vi.mock('@/server/tokens', () => ({
  grantTokens,
  makeSystemInitiator: (tag: string) => `system:${tag}`,
}));

vi.mock('@/server/config', () => ({
  config: {
    POSTAL_FROM_EMAIL: 'YumCut <hello@app.yumcut.com>',
    NEXTAUTH_SECRET: 'test-secret-for-reply-bonus',
    RESEND_WEBHOOK_SECRET: 'whsec_test',
  },
}));

vi.mock('@/server/emails/planned', async () => {
  const actual = await vi.importActual<typeof import('@/server/emails/planned')>('@/server/emails/planned');
  return {
    ...actual,
    sendLocalizedPlainTextEmail,
  };
});

const { buildReplyBonusReplyToAddress } = await import('@/server/emails/planned');
const { processInboundReplyBonus } = await import('@/server/emails/reply-bonus');

describe('processInboundReplyBonus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grantTokens.mockResolvedValue(130);
    sendLocalizedPlainTextEmail.mockResolvedValue({ ok: true, id: 'email-confirm-1', language: 'en' });
  });

  it('grants the bonus once and sends a confirmation email', async () => {
    userFindUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      name: 'Max',
      preferredLanguage: 'en',
      deleted: false,
      emailReplyBonusGrantedAt: null,
    });

    prismaTransaction.mockImplementation(async (callback: any) => callback({
      user: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      tokenTransaction: {
        create: vi.fn(),
      },
    }));

    const result = await processInboundReplyBonus({
      from: 'User <user@example.com>',
      to: [buildReplyBonusReplyToAddress('11111111-1111-1111-1111-111111111111')!],
      emailId: 'email-1',
    });

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      granted: true,
      alreadyGranted: false,
      userMatched: true,
      userId: '11111111-1111-1111-1111-111111111111',
      balance: 130,
      confirmationSent: true,
      reason: 'granted',
    }));
    expect(grantTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '11111111-1111-1111-1111-111111111111',
        amount: 30,
        type: 'EMAIL_REPLY_BONUS',
      }),
      expect.anything(),
    );
    expect(sendLocalizedPlainTextEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        kind: 'reply_bonus_confirmed_v1',
        languageHint: 'en',
      }),
    );
  });

  it('does not grant when sender email does not match the user', async () => {
    userFindUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      name: 'Max',
      preferredLanguage: 'en',
      deleted: false,
      emailReplyBonusGrantedAt: null,
    });

    const result = await processInboundReplyBonus({
      from: 'other@example.com',
      to: [buildReplyBonusReplyToAddress('11111111-1111-1111-1111-111111111111')!],
      emailId: 'email-2',
    });

    expect(result).toEqual(expect.objectContaining({
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: false,
      reason: 'sender_mismatch',
    }));
    expect(grantTokens).not.toHaveBeenCalled();
    expect(sendLocalizedPlainTextEmail).not.toHaveBeenCalled();
  });

  it('does not send a confirmation email when the bonus was already granted', async () => {
    userFindUnique.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'user@example.com',
      name: 'Max',
      preferredLanguage: 'en',
      deleted: false,
      emailReplyBonusGrantedAt: new Date('2026-04-27T00:00:00.000Z'),
    });

    const result = await processInboundReplyBonus({
      from: 'user@example.com',
      to: [buildReplyBonusReplyToAddress('11111111-1111-1111-1111-111111111111')!],
      emailId: 'email-3',
    });

    expect(result).toEqual(expect.objectContaining({
      eligible: true,
      granted: false,
      alreadyGranted: true,
      userMatched: true,
      reason: 'already_granted',
    }));
    expect(grantTokens).not.toHaveBeenCalled();
    expect(sendLocalizedPlainTextEmail).not.toHaveBeenCalled();
  });
});
