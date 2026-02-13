import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { startAppApiServer, startStorageApiServer } from '../daemon-and-api/helpers/app-server';

// Minimal PNG (1x1 transparent)
const PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 1, 3,
  0, 0, 0, 37, 219, 86, 202, 0, 0, 0, 3, 80, 76, 84, 69, 0, 0, 0, 167, 122, 61, 218, 0, 0, 0,
  1, 116, 82, 78, 83, 0, 64, 230, 216, 102, 0, 0, 0, 10, 73, 68, 65, 84, 8, 215, 99, 96, 0, 0,
  0, 2, 0, 1, 226, 33, 188, 245, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe('character upload end-to-end', () => {
  const password = (() => {
    const val = process.env.DAEMON_API_PASSWORD;
    if (!val || val.trim().length === 0) throw new Error('DAEMON_API_PASSWORD must be set for character upload e2e test');
    return val.trim();
  })();
  let app: Awaited<ReturnType<typeof startAppApiServer>> | null = null;
  let storage: Awaited<ReturnType<typeof startStorageApiServer>> | null = null;

  beforeAll(async () => {
    storage = await startStorageApiServer({ daemonPassword: password });
    app = await startAppApiServer({ daemonPassword: password, storagePublicUrl: storage.baseUrl });
  });

  afterAll(async () => {
    try { await app?.close(); } catch {}
    try { await storage?.close(); } catch {}
  });

  it('issues upload token, uploads image to storage, and finalizes character', async () => {
    const uploadTokenRes = await fetch(new URL('/api/storage/upload-token', app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ttlMs: 60_000 }),
    });
    expect(uploadTokenRes.ok).toBe(true);
    const uploadToken = await uploadTokenRes.json();
    expect(uploadToken.data).toBeTruthy();
    expect(uploadToken.signature).toBeTruthy();

    const file = new File([PNG_BYTES], 'avatar.png', { type: 'image/png' });
    const form = new FormData();
    form.set('file', file);
    form.set('data', uploadToken.data);
    form.set('signature', uploadToken.signature);

    const storageRes = await fetch(new URL('/api/storage/user-images', storage!.baseUrl), {
      method: 'POST',
      headers: { Origin: 'http://localhost:3001' },
      body: form as any,
    });
    expect(storageRes.ok).toBe(true);
    const stored = await storageRes.json();
    expect(stored.path).toContain('/'); // path present
    expect(stored.url).toMatch(/http:\/\/localhost:3333/);

    const finalizeRes = await fetch(new URL('/api/characters/custom/upload', app!.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: uploadToken.data,
        signature: uploadToken.signature,
        path: stored.path,
        url: stored.url,
        title: `Test Avatar ${randomUUID().slice(0, 8)}`,
      }),
    });
    if (!finalizeRes.ok) {
      const txt = await finalizeRes.text();
      throw new Error(`Finalize failed ${finalizeRes.status}: ${txt}`);
    }
    const finalize = await finalizeRes.json();
    expect(finalize.userCharacterId).toBeTruthy();
    expect(finalize.variationId).toBeTruthy();
  }, 30000);
});
