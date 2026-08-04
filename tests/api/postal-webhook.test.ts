import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: {
    POSTAL_WEBHOOK_PUBLIC_KEY: '',
  },
  upsert: vi.fn(),
}));

vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/emails/plunk', () => ({ upsertPlunkContact: state.upsert }));

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const route = await import('@/app/api/postal/webhook/route');

function signedRequest(body: string, valid = true) {
  const signature = crypto.sign('RSA-SHA256', Buffer.from(body), privateKey)
    .toString('base64');
  return new NextRequest('http://localhost/api/postal/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postal-Signature-256': valid ? signature : Buffer.from('invalid').toString('base64'),
    },
    body,
  });
}

beforeAll(() => {
  state.config.POSTAL_WEBHOOK_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

beforeEach(() => {
  vi.clearAllMocks();
  state.upsert.mockResolvedValue({ id: 'contact-1' });
});

describe('POST /api/postal/webhook', () => {
  it('suppresses bounced recipients in Plunk after verifying the Postal signature', async () => {
    const body = JSON.stringify({
      event: 'MessageBounced',
      timestamp: Date.now() / 1000,
      uuid: 'webhook-1',
      payload: { original_message: { to: 'User@Example.com' } },
    });

    const response = await route.POST(signedRequest(body));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, handled: true });
    expect(state.upsert).toHaveBeenCalledWith({
      email: 'user@example.com',
      subscribed: false,
      data: {
        source: 'app.yumcut.com',
        delivery_provider: 'postal',
        suppression_reason: 'MessageBounced',
      },
    });
  });

  it('rejects an invalid signature', async () => {
    const response = await route.POST(signedRequest(JSON.stringify({ event: 'MessageBounced' }), false));
    expect(response.status).toBe(403);
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it('acknowledges non-suppression events without changing consent', async () => {
    const body = JSON.stringify({
      event: 'MessageSent',
      payload: { message: { to: 'user@example.com' } },
    });
    const response = await route.POST(signedRequest(body));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, handled: false });
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
