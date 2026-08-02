import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eventsSend: vi.fn(),
  emailsSend: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    events = { send: mocks.eventsSend };
    emails = {
      send: mocks.emailsSend,
      receiving: { get: vi.fn() },
    };
    webhooks = { verify: vi.fn() };
  },
}));

vi.mock('@/server/config', () => ({
  config: {
    RESEND_API_KEY: 'resend-secret',
    RESEND_FROM_EMAIL: 'YumCut <support@yumcut.com>',
    RESEND_MARKETING_EVENT_NAME: 'yumcut.marketing.email.v1',
  },
}));

const { sendResendEmail, splitResendAutomationBody } = await import('@/server/emails/resend');

describe('sendResendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventsSend.mockResolvedValue({ data: { event: 'yumcut.marketing.email.v1' }, error: null });
    mocks.emailsSend.mockResolvedValue({ data: { id: 'resend-direct-1' }, error: null });
  });

  it('sends marketing mail through the managed-unsubscribe Automation', async () => {
    const text = `${'a'.repeat(2_000)}${'b'.repeat(10)}`;

    await expect(sendResendEmail({
      to: 'user@example.com',
      subject: 'Marketing subject',
      text,
      marketing: true,
      idempotencyKey: 'planned-1',
    })).resolves.toEqual({ ok: true, id: 'resend-event:planned-1' });

    expect(mocks.eventsSend).toHaveBeenCalledWith({
      event: 'yumcut.marketing.email.v1',
      email: 'user@example.com',
      payload: expect.objectContaining({
        subject: 'Marketing subject',
        body_01: 'a'.repeat(2_000),
        body_02: 'b'.repeat(10),
        source_id: 'planned-1',
      }),
    });
    expect(mocks.emailsSend).not.toHaveBeenCalled();
  });

  it('sends transactional mail directly without a marketing Automation', async () => {
    await expect(sendResendEmail({
      to: 'user@example.com',
      subject: 'Project ready',
      text: 'Your project is ready.',
      replyTo: 'reply@yumcut.com',
      marketing: false,
      idempotencyKey: 'planned-2',
    })).resolves.toEqual({ ok: true, id: 'resend-direct-1' });

    expect(mocks.emailsSend).toHaveBeenCalledWith({
      from: 'YumCut <support@yumcut.com>',
      to: ['user@example.com'],
      replyTo: ['reply@yumcut.com'],
      subject: 'Project ready',
      text: 'Your project is ready.',
    }, { idempotencyKey: 'planned-2' });
    expect(mocks.eventsSend).not.toHaveBeenCalled();
  });

  it('rejects marketing text beyond the Automation payload limit', () => {
    expect(() => splitResendAutomationBody('x'.repeat(20_001))).toThrow(/cannot exceed 20000/);
  });
});
