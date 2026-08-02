import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  plannedEmail: {
    count: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const plunkSendMock = vi.hoisted(() => vi.fn());
const shouldQueueFollowUp24hEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/server/config', () => ({
  config: {
    PLUNK_FROM_EMAIL: 'YumCut <hello@app.yumcut.com>',
    NEXTAUTH_SECRET: 'test-secret-for-reply-bonus',
  },
}));

vi.mock('@/server/emails/plunk', () => ({
  sendPlunkEmail: plunkSendMock,
}));

vi.mock('@/server/admin/emails', () => ({
  shouldQueueFollowUp24hEmail: shouldQueueFollowUp24hEmailMock,
}));

import {
  buildReplyBonusReplyToAddress,
  parseReplyBonusReplyToAddress,
  processPlannedEmails,
  queueUserOnboardingEmails,
  scheduleUserOnboardingEmails,
} from '@/server/emails/planned';

function mockClaimedEmails(claimed: Array<{
  id: string;
  userId: string;
  email: string;
  kind: string;
  subject?: string | null;
  text?: string | null;
  attempts: number;
  targetLanguage: string;
  user: { preferredLanguage: string; name: string | null; deleted: boolean } | null;
}>) {
  prismaMock.$transaction.mockImplementation(async (callback: any) => {
    const tx = {
      plannedEmail: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(claimed.map((item) => ({ id: item.id })))
          .mockResolvedValueOnce(claimed.map((item) => ({
            ...item,
            subject: item.subject ?? null,
            text: item.text ?? null,
          }))),
        updateMany: vi.fn().mockResolvedValue({ count: claimed.length }),
      },
    };
    return callback(tx);
  });
}

describe('planned emails localization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ preferredLanguage: 'en' });
    prismaMock.plannedEmail.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    prismaMock.plannedEmail.createMany.mockResolvedValue({ count: 2 });
    prismaMock.plannedEmail.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.plannedEmail.updateMany.mockResolvedValue({ count: 1 });
    plunkSendMock.mockResolvedValue({ ok: true, id: 'plunk_test_1' });
    shouldQueueFollowUp24hEmailMock.mockResolvedValue(true);
  });

  it('stores targetLanguage when queueing onboarding emails', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ preferredLanguage: 'ru-RU' });

    const queued = await queueUserOnboardingEmails({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Ivan',
    });

    expect(queued).toBe(true);
    expect(prismaMock.plannedEmail.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ kind: 'welcome_v1', targetLanguage: 'ru' }),
          expect.objectContaining({ kind: 'follow_up_24h_v1', targetLanguage: 'ru' }),
        ]),
      }),
    );
  });

  it('queues welcome email when 24-hour follow-up is disabled', async () => {
    shouldQueueFollowUp24hEmailMock.mockResolvedValue(false);
    prismaMock.$transaction.mockResolvedValue([]);

    const result = await scheduleUserOnboardingEmails({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Ivan',
    });

    expect(result).toEqual({
      queued: true,
      processed: {
        plannedDue: 1,
        plannedPending: 1,
        claimed: 0,
        sent: 0,
        rescheduled: 0,
        failed: 0,
        skipped: 0,
      },
    });
    expect(prismaMock.plannedEmail.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ kind: 'welcome_v1' }),
        ],
      }),
    );
    expect(prismaMock.plannedEmail.createMany.mock.calls[0]?.[0]?.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'follow_up_24h_v1' }),
      ]),
    );
  });

  it('builds and verifies signed reply bonus aliases', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const alias = buildReplyBonusReplyToAddress(userId);
    expect(alias).toMatch(/^rb\+11111111-1111-1111-1111-111111111111\.[a-f0-9]{16}@app\.yumcut\.com$/);
    const localPart = alias!.split('@')[0] ?? '';
    expect(localPart.length).toBeLessThanOrEqual(64);
    expect(parseReplyBonusReplyToAddress([alias!])).toEqual({ userId });
    const legacyAlias = alias!.replace(/^rb\+/, 'reply-bonus+');
    expect(parseReplyBonusReplyToAddress([legacyAlias])).toEqual({ userId });
    expect(parseReplyBonusReplyToAddress(['reply-bonus+11111111-1111-1111-1111-111111111111.deadbeefdeadbeef@app.yumcut.com'])).toBeNull();
  });

  it('uses russian template when user language is ru before send', async () => {
    mockClaimedEmails([
      {
        id: 'planned-1',
        userId: 'user-1',
        email: 'user@example.com',
        kind: 'welcome_v1',
        attempts: 0,
        targetLanguage: 'en',
        user: { preferredLanguage: 'ru', name: 'Иван', deleted: false },
      },
    ]);

    const result = await processPlannedEmails({ limit: 10 });

    expect(result).toEqual({
      plannedDue: 1,
      plannedPending: 1,
      claimed: 1,
      sent: 1,
      rescheduled: 0,
      failed: 0,
      skipped: 0,
    });

    expect(plunkSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Иван, личное сообщение',
        text: expect.stringContaining('здравствуйте, Иван!'),
        replyTo: expect.stringMatching(/^rb\+user-1\.[a-f0-9]{16}@app\.yumcut\.com$/),
      }),
    );

    expect(prismaMock.plannedEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          targetLanguage: 'ru',
        }),
      }),
    );
  });

  it('renders russian welcome naturally when name is missing', async () => {
    mockClaimedEmails([
      {
        id: 'planned-ru-no-name',
        userId: 'user-ru-no-name',
        email: 'user@example.com',
        kind: 'welcome_v1',
        attempts: 0,
        targetLanguage: 'ru',
        user: { preferredLanguage: 'ru', name: null, deleted: false },
      },
    ]);

    await processPlannedEmails({ limit: 10 });

    expect(plunkSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'личное сообщение',
        text: expect.stringContaining('здравствуйте!'),
      }),
    );

    expect(plunkSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining('друг'),
      }),
    );
  });

  it('falls back to english template when language template is missing', async () => {
    mockClaimedEmails([
      {
        id: 'planned-2',
        userId: 'user-2',
        email: 'user@example.com',
        kind: 'welcome_v1',
        attempts: 0,
        targetLanguage: 'de',
        user: { preferredLanguage: 'de-DE', name: 'Max', deleted: false },
      },
    ]);

    await processPlannedEmails({ limit: 10 });

    expect(plunkSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'personal message for Max',
        text: expect.stringMatching(/hey Max,[\s\S]*30 tokens/i),
      }),
    );

    expect(prismaMock.plannedEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          targetLanguage: 'en',
        }),
      }),
    );
  });

  it('sends queued admin subject and text without rendering a template', async () => {
    mockClaimedEmails([
      {
        id: 'planned-admin-manual',
        userId: 'user-admin-message',
        email: 'user@example.com',
        kind: 'admin_manual_operation-1',
        subject: 'Manual admin notice',
        text: 'Plain text body from admin API.',
        attempts: 0,
        targetLanguage: 'ru',
        user: { preferredLanguage: 'ru', name: 'Иван', deleted: false },
      },
    ]);

    const result = await processPlannedEmails({ limit: 10 });

    expect(result.sent).toBe(1);
    expect(plunkSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Manual admin notice',
        text: 'Plain text body from admin API.',
      }),
    );
    expect(plunkSendMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        replyTo: expect.anything(),
      }),
    );
  });

  it('skips and removes claimed emails for deleted users', async () => {
    mockClaimedEmails([
      {
        id: 'planned-deleted-user',
        userId: 'deleted-user-1',
        email: 'user@example.com',
        kind: 'welcome_v1',
        attempts: 0,
        targetLanguage: 'en',
        user: { preferredLanguage: 'en', name: 'Deleted User', deleted: true },
      },
    ]);

    const result = await processPlannedEmails({ limit: 10 });

    expect(result).toEqual({
      plannedDue: 1,
      plannedPending: 1,
      claimed: 1,
      sent: 0,
      rescheduled: 0,
      failed: 0,
      skipped: 1,
    });
    expect(plunkSendMock).not.toHaveBeenCalled();
    expect(prismaMock.plannedEmail.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'planned-deleted-user',
          status: 'pending',
        }),
      }),
    );
  });
});
