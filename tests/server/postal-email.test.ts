import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: {
    POSTAL_API_URL: 'https://postal-api.example.com',
    POSTAL_API_KEY: 'postal-test-secret',
    POSTAL_FROM_EMAIL: 'YumCut <support@yumcut.com>',
    POSTAL_WEBHOOK_PUBLIC_KEY: undefined as string | undefined,
    PLUNK_SECRET_KEY: 'plunk-test-secret',
    PLUNK_PREFERENCES_URL: 'https://mail.yumcut.com',
  },
  upsert: vi.fn(),
}));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/emails/plunk', () => ({ upsertPlunkContact: state.upsert }));
vi.stubGlobal('fetch', fetchMock);

const { sendPostalEmail } = await import('@/server/emails/postal');

function postalResponse(messageId: string) {
  return new Response(JSON.stringify({
    status: 'success',
    data: {
      message_id: messageId,
      messages: { 'user@example.com': { id: 42, token: 'token-42' } },
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.upsert.mockResolvedValue({
    id: 'contact-123',
    email: 'user@example.com',
    subscribed: true,
  });
  fetchMock.mockResolvedValue(postalResponse('postal-message-1'));
});

describe('Postal email delivery', () => {
  it('uses Plunk consent and branded one-click unsubscribe for marketing mail', async () => {
    await expect(sendPostalEmail({
      to: 'user@example.com',
      subject: 'Welcome',
      text: 'Hello\n\nhttps://yumcut.com/account',
      replyTo: 'reply@yumcut.com',
      marketing: true,
      idempotencyKey: 'planned-123',
    })).resolves.toEqual({ ok: true, id: 'postal-message-1' });

    expect(state.upsert).toHaveBeenCalledWith({
      email: 'user@example.com',
      data: { source: 'app.yumcut.com', delivery_provider: 'postal' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://postal-api.example.com/api/v1/send/message');
    const requestHeaders = new Headers(init.headers);
    expect(requestHeaders.get('X-Server-API-Key')).toBe('postal-test-secret');

    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      to: ['user@example.com'],
      from: 'YumCut <support@yumcut.com>',
      reply_to: 'reply@yumcut.com',
      tag: 'yumcut-marketing',
      headers: {
        'List-Unsubscribe': '<https://mail.yumcut.com/unsubscribe/contact-123>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-YumCut-Idempotency-Key': 'planned-123',
      },
    });
    expect(payload.plain_body).toContain('Unsubscribe: https://mail.yumcut.com/unsubscribe/contact-123');
    expect(payload.html_body).toContain('https://mail.yumcut.com/manage/contact-123');
    expect(payload.html_body).toContain('https://mail.yumcut.com/unsubscribe/contact-123');
  });

  it('suppresses marketing delivery when Plunk says the contact unsubscribed', async () => {
    state.upsert.mockResolvedValue({
      id: 'contact-unsubscribed',
      email: 'user@example.com',
      subscribed: false,
    });

    await expect(sendPostalEmail({
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends transactional mail despite marketing opt-out and without unsubscribe data', async () => {
    state.upsert.mockResolvedValue({
      id: 'contact-unsubscribed',
      email: 'user@example.com',
      subscribed: false,
    });

    await expect(sendPostalEmail({
      to: 'user@example.com',
      subject: 'Your project is ready',
      text: 'Download it now.',
      marketing: false,
    })).resolves.toEqual({ ok: true, id: 'postal-message-1' });

    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.tag).toBe('yumcut-transactional');
    expect(payload.headers).toBeUndefined();
    expect(payload.plain_body).not.toContain('unsubscribe');
    expect(payload.html_body).not.toContain('unsubscribe');
  });

  it('treats a Postal error payload returned with HTTP 200 as a failed send', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      status: 'error',
      data: { code: 'UnauthenticatedFromAddress', message: 'Sender is not authorized' },
    }), { status: 200 }));

    const result = await sendPostalEmail({
      to: 'user@example.com',
      subject: 'Project ready',
      text: 'Done',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Sender is not authorized');
  });
});
