import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: {
    POSTAL_API_URL: 'https://postal-api.example.com',
    POSTAL_API_KEY: 'postal-test-secret',
    POSTAL_FROM_EMAIL: 'YumCut <support@yumcut.com>',
    POSTAL_WEBHOOK_PUBLIC_KEY: undefined as string | undefined,
    EMAIL_PREFERENCES_URL: 'https://mail.yumcut.com',
  },
  ensureContact: vi.fn(),
  deliveryCreate: vi.fn(),
}));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/db', () => ({ prisma: { emailDeliveryEvent: { create: state.deliveryCreate } } }));
vi.mock('@/server/emails/contacts', () => ({
  ensureEmailContact: state.ensureContact,
  normalizeEmailContactAddress: (email?: string) => email?.trim().toLowerCase() || null,
  suppressEmailContact: vi.fn(),
}));
vi.stubGlobal('fetch', fetchMock);

const { sendPostalEmail, sendPostalMarketingTestEmail } = await import('@/server/emails/postal');

beforeEach(() => {
  vi.clearAllMocks();
  state.ensureContact.mockResolvedValue({ id: 'contact-123', preferenceToken: '11111111-1111-4111-8111-111111111111', marketingSubscribed: true, suppressedAt: null });
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: { message_id: 'postal-message-1' } }), { status: 200 }));
});

describe('Postal email delivery', () => {
  it('uses local consent and branded one-click unsubscribe for marketing mail', async () => {
    await expect(sendPostalEmail({ to: 'user@example.com', subject: 'Welcome', text: 'Hello', marketing: true, idempotencyKey: 'planned-123' }))
      .resolves.toEqual({ ok: true, id: 'postal-message-1' });
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.headers).toMatchObject({
      'List-Unsubscribe': '<https://mail.yumcut.com/unsubscribe/11111111-1111-4111-8111-111111111111>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'Feedback-ID': 'general:yumcut:marketing:yumcutmail',
      'X-YumCut-Idempotency-Key': 'planned-123',
    });
    expect(payload.html_body).toContain('/manage/11111111-1111-4111-8111-111111111111');
  });

  it('fails closed for marketing to an unsubscribed contact', async () => {
    state.ensureContact.mockResolvedValue({ id: 'contact-2', preferenceToken: 'token', marketingSubscribed: false, suppressedAt: null });
    await expect(sendPostalEmail({ to: 'user@example.com', subject: 'News', text: 'News', marketing: true }))
      .resolves.toEqual({ ok: true, skipped: true, reason: 'unsubscribed', id: 'contact-2' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an explicit unsubscribed admin test without changing consent', async () => {
    state.ensureContact.mockResolvedValue({ id: 'contact-2', preferenceToken: 'token', marketingSubscribed: false, suppressedAt: null });
    await expect(sendPostalMarketingTestEmail({
      to: 'admin@example.com',
      subject: 'Campaign test',
      text: 'Preview',
    })).resolves.toEqual({ ok: true, id: 'postal-message-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(state.ensureContact).toHaveBeenCalledWith(expect.objectContaining({ subscribedOnCreate: false }));
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.headers).toMatchObject({
      'List-Unsubscribe': '<https://mail.yumcut.com/unsubscribe/token>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'Feedback-ID': 'general:yumcut:marketing:yumcutmail',
    });
  });

  it('sends transactional mail after marketing opt-out without an unsubscribe footer', async () => {
    state.ensureContact.mockResolvedValue({ id: 'contact-2', preferenceToken: 'token', marketingSubscribed: false, suppressedAt: null });
    await expect(sendPostalEmail({ to: 'user@example.com', subject: 'Project ready', text: 'Done', marketing: false }))
      .resolves.toEqual({ ok: true, id: 'postal-message-1' });
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.headers).toBeUndefined();
    expect(payload.html_body).not.toContain('unsubscribe');
  });

  it('does not send even transactional mail to a hard-suppressed address', async () => {
    state.ensureContact.mockResolvedValue({ id: 'contact-3', preferenceToken: 'token', marketingSubscribed: false, suppressedAt: new Date() });
    await expect(sendPostalEmail({ to: 'user@example.com', subject: 'Project ready', text: 'Done' }))
      .resolves.toEqual({ ok: true, skipped: true, reason: 'suppressed', id: 'contact-3' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
