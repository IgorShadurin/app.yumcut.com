import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const forwardInboundToContact = vi.hoisted(() => vi.fn());
vi.mock('@/server/emails/inbound-forward', () => ({ forwardInboundToContact }));

const verifyResendWebhook = vi.hoisted(() => vi.fn());
const getReceivedEmail = vi.hoisted(() => vi.fn());
const notifyAdminsWithMessage = vi.hoisted(() => vi.fn());
const processInboundReplyBonus = vi.hoisted(() => vi.fn());
const persistInboundFeedback = vi.hoisted(() => vi.fn());

vi.mock('@/server/config', () => ({
  config: {
    RESEND_WEBHOOK_SECRET: 'whsec_test',
  },
}));

vi.mock('@/server/emails/resend', () => ({
  verifyResendWebhook,
  getReceivedEmail,
}));

vi.mock('@/server/telegram', () => ({
  notifyAdminsWithMessage,
}));

vi.mock('@/server/emails/reply-bonus', () => ({
  processInboundReplyBonus,
}));

vi.mock('@/server/admin/feedbacks', () => ({
  persistInboundFeedback,
}));

const route = await import('@/app/api/resend/inbound/route');

describe('POST /api/resend/inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forwardInboundToContact.mockResolvedValue('forward-1');
    notifyAdminsWithMessage.mockResolvedValue(undefined);
    persistInboundFeedback.mockResolvedValue({});
    processInboundReplyBonus.mockResolvedValue({
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: false,
      reason: 'no_signed_recipient',
    });
  });

  function makeReq(body: string) {
    return new NextRequest('http://localhost/api/resend/inbound', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'svix-id': 'msg_1',
        'svix-timestamp': '123',
        'svix-signature': 'v1,test',
      }),
      body,
    });
  }

  it('returns 200 and forwards parsed inbound email details', async () => {
    verifyResendWebhook.mockReturnValue({
      type: 'email.received',
      data: {
        email_id: 'email-1',
        from: 'sender@example.com',
        to: ['support@app.yumcut.com'],
        subject: 'Hello',
      },
    });
    getReceivedEmail.mockResolvedValue({
      from: 'sender@example.com',
      to: ['support@app.yumcut.com'],
      subject: 'Hello',
      text: 'Inbound text body',
    });

    const res = await route.POST(makeReq('{"ok":true}'));
    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.ok).toBe(true);
    expect(payload.emailId).toBe('email-1');
    expect(payload.forwardedToTelegram).toBe(true);
    expect(payload.forwardedToEmail).toBe(true);
    expect(forwardInboundToContact).toHaveBeenCalledWith('email-1');
    expect(payload.snippetSource).toBe('api');
    expect(payload.enriched).toBe(true);
    expect(payload.replyBonus.granted).toBe(false);
    expect(notifyAdminsWithMessage).toHaveBeenCalledWith(expect.stringContaining('Inbound text body'));
    expect(persistInboundFeedback).toHaveBeenCalledWith(expect.objectContaining({
      emailId: 'email-1',
      from: 'sender@example.com',
      to: ['support@app.yumcut.com'],
      subject: 'Hello',
      latestReplyText: 'Inbound text body',
      snippetSource: 'api',
      enriched: true,
      forwardedToTelegram: true,
    }));
  });

  it('returns 200 when Resend email fetch fails and uses webhook fallback fields', async () => {
    verifyResendWebhook.mockReturnValue({
      type: 'email.received',
      data: {
        email_id: 'email-2',
        from: 'fallback@example.com',
        to: ['support@app.yumcut.com'],
        subject: 'Fallback subject',
      },
    });
    getReceivedEmail.mockRejectedValue(new Error('502 upstream error'));

    const res = await route.POST(makeReq('{"ok":true}'));
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.emailId).toBe('email-2');
    expect(payload.inboundFetchError).toContain('502 upstream error');
    expect(payload.forwardedToTelegram).toBe(true);
    expect(payload.snippetSource).toBe('none');
    expect(payload.enriched).toBe(false);
    expect(getReceivedEmail).toHaveBeenCalledTimes(3);
    expect(notifyAdminsWithMessage).toHaveBeenCalledWith(expect.stringContaining('Fallback subject'));
  });

  it('returns 200 even when telegram forwarding fails', async () => {
    verifyResendWebhook.mockReturnValue({
      type: 'email.received',
      data: {
        email_id: 'email-3',
        from: 'sender@example.com',
        to: ['support@app.yumcut.com'],
        subject: 'Hello',
      },
    });
    getReceivedEmail.mockResolvedValue({
      from: 'sender@example.com',
      to: ['support@app.yumcut.com'],
      subject: 'Hello',
      text: 'Inbound text body',
    });
    notifyAdminsWithMessage.mockRejectedValue(new Error('Telegram API 502'));

    const res = await route.POST(makeReq('{"ok":true}'));
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.emailId).toBe('email-3');
    expect(payload.forwardedToTelegram).toBe(false);
    expect(payload.telegramForwardError).toContain('Telegram API 502');
  });

  it('extracts only the latest reply from quoted thread content', async () => {
    verifyResendWebhook.mockReturnValue({
      type: 'email.received',
      data: {
        email_id: 'email-4',
        from: 'sender@example.com',
        to: ['support@app.yumcut.com'],
        subject: 'Reply',
      },
    });
    getReceivedEmail.mockResolvedValue({
      from: 'sender@example.com',
      to: ['support@app.yumcut.com'],
      subject: 'Reply',
      text: [
        'wtfffff',
        '',
        'On Thu, Mar 26, 2026 at 10:53 AM YumCut <hello@app.yumcut.com> wrote:',
        '> Welcome to YumCut.',
      ].join('\n'),
    });

    const res = await route.POST(makeReq('{"ok":true}'));
    expect(res.status).toBe(200);

    expect(notifyAdminsWithMessage).toHaveBeenCalledWith(expect.stringContaining('wtfffff'));
    expect(notifyAdminsWithMessage).not.toHaveBeenCalledWith(expect.stringContaining('Welcome to YumCut.'));
  });

  it('requests retry when forwarding fails after preserving existing processing', async () => {
    verifyResendWebhook.mockReturnValue({ type: 'email.received', data: { email_id: 'retry-1' } });
    getReceivedEmail.mockResolvedValue({ from: 'sender@example.com', to: ['hello@yumcut.com'], text: 'hello' });
    forwardInboundToContact.mockRejectedValueOnce(new Error('rate limited'));
    const res = await route.POST(new NextRequest('http://localhost/api/resend/inbound', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(503);
    expect(processInboundReplyBonus).toHaveBeenCalled();
    expect(notifyAdminsWithMessage).toHaveBeenCalled();
    expect(persistInboundFeedback).toHaveBeenCalled();
  });

  it('does not forward unauthenticated events', async () => {
    verifyResendWebhook.mockReturnValue(null);
    const res = await route.POST(makeReq('{}'));
    expect(res.status).toBe(403);
    expect(forwardInboundToContact).not.toHaveBeenCalled();
  });

  it('does not forward outbound events', async () => {
    verifyResendWebhook.mockReturnValue({ type: 'email.sent', data: { email_id: 'out-1' } });
    const res = await route.POST(makeReq('{}'));
    expect(res.status).toBe(200);
    expect(forwardInboundToContact).not.toHaveBeenCalled();
  });
});
