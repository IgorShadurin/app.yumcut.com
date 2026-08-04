import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: { POSTAL_WEBHOOK_PUBLIC_KEY: '' },
  eventCreate: vi.fn(),
  suppress: vi.fn(),
}));
vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/db', () => ({ prisma: { emailDeliveryEvent: { create: state.eventCreate } } }));
vi.mock('@/server/emails/contacts', () => ({
  normalizeEmailContactAddress: (email?: string) => email?.trim().toLowerCase() || null,
  ensureEmailContact: vi.fn(),
  suppressEmailContact: state.suppress,
}));

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const route = await import('@/app/api/postal/webhook/route');

function signedRequest(body: string, valid = true) {
  const signature = crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64');
  return new NextRequest('http://localhost/api/postal/webhook', { method: 'POST', headers: { 'X-Postal-Signature-256': valid ? signature : 'bad' }, body });
}

beforeAll(() => { state.config.POSTAL_WEBHOOK_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString(); });
beforeEach(() => { vi.clearAllMocks(); state.eventCreate.mockResolvedValue({ id: 'event-1' }); });

describe('POST /api/postal/webhook', () => {
  it('stores the signed event and suppresses a bounced recipient locally', async () => {
    const body = JSON.stringify({ event: 'MessageBounced', uuid: 'webhook-1', payload: { original_message: { id: 42, to: 'User@Example.com' } } });
    const response = await route.POST(signedRequest(body));
    expect(response.status).toBe(200);
    expect(state.eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ providerEventId: 'webhook-1', recipient: 'user@example.com' }) });
    expect(state.suppress).toHaveBeenCalledWith({ email: 'user@example.com', reason: 'MessageBounced', details: null });
  });

  it('rejects an invalid signature', async () => {
    const response = await route.POST(signedRequest(JSON.stringify({ event: 'MessageBounced' }), false));
    expect(response.status).toBe(403);
    expect(state.eventCreate).not.toHaveBeenCalled();
  });

  it('audits non-suppression events without suppressing the recipient', async () => {
    const body = JSON.stringify({ event: 'MessageSent', uuid: 'webhook-2', payload: { message: { to: 'user@example.com' } } });
    const response = await route.POST(signedRequest(body));
    expect(response.status).toBe(200);
    expect(state.eventCreate).toHaveBeenCalled();
    expect(state.suppress).not.toHaveBeenCalled();
  });
});
