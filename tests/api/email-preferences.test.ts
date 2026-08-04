import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ find: vi.fn(), set: vi.fn() }));
vi.mock('@/server/emails/contacts', () => ({
  findEmailContactByPreferenceToken: state.find,
  setEmailMarketingSubscription: state.set,
}));

const manage = await import('@/app/manage/[token]/route');
const unsubscribe = await import('@/app/unsubscribe/[token]/route');
const params = { params: Promise.resolve({ token: '11111111-1111-4111-8111-111111111111' }) };

beforeEach(() => {
  vi.clearAllMocks();
  state.find.mockResolvedValue({ email: 'user@example.com', marketingSubscribed: true, suppressedAt: null });
  state.set.mockResolvedValue({ status: 'unsubscribed', contact: { email: 'user@example.com', marketingSubscribed: false, suppressedAt: null } });
});

describe('email preference routes', () => {
  it('does not unsubscribe on GET', async () => {
    const response = await unsubscribe.GET(new NextRequest('https://mail.yumcut.com/unsubscribe/token'), params);
    expect(response.status).toBe(200);
    expect(state.set).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('unsubscribes through the RFC 8058 POST endpoint', async () => {
    const response = await unsubscribe.POST(new NextRequest('https://mail.yumcut.com/unsubscribe/token', { method: 'POST', body: 'List-Unsubscribe=One-Click' }), params);
    expect(response.status).toBe(200);
    expect(state.set).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', false);
  });

  it('updates the marketing preference through the manage form', async () => {
    state.set.mockResolvedValue({ status: 'subscribed', contact: { email: 'user@example.com', marketingSubscribed: true, suppressedAt: null } });
    const response = await manage.POST(new NextRequest('https://mail.yumcut.com/manage/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'subscribed=true' }), params);
    expect(response.status).toBe(200);
    expect(state.set).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', true);
  });
});
