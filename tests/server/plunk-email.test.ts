import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/server/config', () => ({
  config: {
    PLUNK_API_URL: 'https://mail-api.copymyui.com',
    PLUNK_SECRET_KEY: 'sk_test_plunk',
    PLUNK_FROM_EMAIL: 'YumCut <support@yumcut.com>',
    PLUNK_PREFERENCES_URL: 'https://mail.yumcut.com',
  },
}));

const { sendPlunkEmail } = await import('@/server/emails/plunk');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Plunk email delivery', () => {
  it('adds branded unsubscribe controls to marketing mail', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 'contact-123',
        email: 'user@example.com',
        subscribed: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { emails: [{ email: 'email-123' }] },
      }));

    await expect(sendPlunkEmail({
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Hello\n\nhttps://yumcut.com/account',
      marketing: true,
      idempotencyKey: 'planned-123',
    })).resolves.toEqual({ ok: true, id: 'email-123' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(sendUrl).toBe('https://mail-api.copymyui.com/v1/send');
    expect(new Headers(sendInit.headers).get('Idempotency-Key')).toBe('planned-123');

    const payload = JSON.parse(String(sendInit.body));
    expect(payload.from).toEqual({ name: 'YumCut', email: 'support@yumcut.com' });
    expect(payload.headers).toEqual({
      'List-Unsubscribe': '<https://mail.yumcut.com/unsubscribe/contact-123>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(payload.body).toContain('https://mail.yumcut.com/man&#97;ge/contact-123');
    expect(payload.body).toContain('https://mail.yumcut.com/unsub&#115;cribe/contact-123');
    expect(payload.body).not.toContain('https://mail.yumcut.com/manage/contact-123');
    expect(payload.body).not.toContain('https://mail.yumcut.com/unsubscribe/contact-123');
  });

  it('does not send marketing mail to an unsubscribed contact', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: 'contact-unsubscribed',
      email: 'user@example.com',
      subscribed: false,
    }));

    await expect(sendPlunkEmail({
      to: 'user@example.com',
      subject: 'Newsletter',
      text: 'News',
      marketing: true,
    })).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: 'unsubscribed',
      id: 'contact-unsubscribed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps transactional mail free of unsubscribe headers and footer', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 'contact-123',
        email: 'user@example.com',
        subscribed: false,
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { emails: [{ email: 'email-transactional' }] },
      }));

    await expect(sendPlunkEmail({
      to: 'user@example.com',
      subject: 'Your project is ready',
      text: 'Download it now.',
      marketing: false,
    })).resolves.toEqual({ ok: true, id: 'email-transactional' });

    const payload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(payload.headers).toBeUndefined();
    expect(payload.body).not.toContain('unsubscribe');
    expect(payload.body).not.toContain('manage email preferences');
  });
});
