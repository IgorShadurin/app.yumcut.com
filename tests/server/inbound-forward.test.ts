import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CONTACT_EMAIL } from '@/shared/constants/app';

const mocks = vi.hoisted(() => ({ find: vi.fn(), upsert: vi.fn(), update: vi.fn(), get: vi.fn(), list: vi.fn(), send: vi.fn() }));
vi.mock('@/server/db', () => ({ prisma: { emailDeliveryEvent: { findUnique: mocks.find, upsert: mocks.upsert, update: mocks.update } } }));
vi.mock('@/server/config', () => ({ config: { RESEND_FROM_EMAIL: 'YumCut <support@yumcut.com>' } }));
vi.mock('@/server/emails/resend', () => ({
  getReceivedEmail: mocks.get,
  getResendClient: () => ({ emails: { send: mocks.send, receiving: { attachments: { list: mocks.list } } } }),
}));
const { forwardInboundToContact } = await import('@/server/emails/inbound-forward');

describe('inbound forwarding', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.find.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({ messageId: null });
    mocks.update.mockResolvedValue({});
    mocks.get.mockResolvedValue({ from: 'Customer <customer@example.com>', to: ['support@yumcut.com'], subject: 'Hello', text: 'x'.repeat(6000), html: '<p>full body</p>', reply_to: ['reply@example.com'] });
    mocks.list.mockResolvedValue({ data: { data: [], has_more: false } });
    mocks.send.mockResolvedValue({ data: { id: 'sent-1' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('file bytes')));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends full bodies to CONTACT_EMAIL, with reply-to and stable idempotency', async () => {
    await expect(forwardInboundToContact('in-1')).resolves.toBe('sent-1');
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'YumCut <support@yumcut.com>', to: [CONTACT_EMAIL], replyTo: ['reply@example.com'], text: 'x'.repeat(6000), html: '<p>full body</p>',
    }), { idempotencyKey: expect.stringMatching(/^inbound-forward:/) });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { eventType: 'inbound.forward.sent', messageId: 'sent-1' } }));
    await forwardInboundToContact('in-1');
    expect(mocks.send.mock.calls[0]?.[1]).toEqual(mocks.send.mock.calls[1]?.[1]);
  });

  it('downloads all attachment pages and preserves inline content IDs', async () => {
    mocks.list.mockResolvedValueOnce({ data: { data: [{ id: 'a', filename: 'image.png', content_type: 'image/png', content_id: '<inline>', download_url: 'https://files.example/a' }], has_more: true } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'b', filename: 'file.pdf', content_type: 'application/pdf', download_url: 'https://files.example/b' }], has_more: false } });
    vi.mocked(fetch).mockImplementation(async () => new Response('file bytes'));
    await forwardInboundToContact('in-1');
    expect(mocks.list).toHaveBeenLastCalledWith({ emailId: 'in-1', limit: 100, after: 'a' });
    expect(mocks.send.mock.calls[0]?.[0].attachments).toEqual([
      { filename: 'image.png', contentType: 'image/png', contentId: 'inline', content: Buffer.from('file bytes').toString('base64') },
      { filename: 'file.pdf', contentType: 'application/pdf', content: Buffer.from('file bytes').toString('base64') },
    ]);
  });

  it('does not resend a recorded success even after the provider window expires', async () => {
    mocks.find.mockResolvedValue({ messageId: 'already-sent', createdAt: new Date(0) });
    await expect(forwardInboundToContact('in-1')).resolves.toBe('already-sent');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not resend an ambiguous old attempt', async () => {
    mocks.find.mockResolvedValue({ messageId: null, createdAt: new Date(0) });
    await expect(forwardInboundToContact('in-1')).rejects.toThrow('reconciliation');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('honors a concurrent success recorded during preparation', async () => {
    mocks.upsert.mockResolvedValue({ messageId: 'concurrent-success' });
    await expect(forwardInboundToContact('in-1')).resolves.toBe('concurrent-success');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not mark provider errors successful', async () => {
    mocks.send.mockResolvedValue({ error: { message: 'quota exceeded' } });
    await expect(forwardInboundToContact('in-1')).rejects.toThrow('quota exceeded');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not silently drop attachments on download failures', async () => {
    mocks.list.mockResolvedValue({ data: { data: [{ id: 'a', filename: 'file', content_type: 'text/plain', download_url: 'https://files.example/a' }], has_more: false } });
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
    await expect(forwardInboundToContact('in-1')).rejects.toThrow('download failed');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('preserves unparsed content as an original .eml and uses sender for replies', async () => {
    mocks.get.mockResolvedValue({ from: 'sender@example.com', text: null, html: null, raw: { download_url: 'https://files.example/raw' } });
    await forwardInboundToContact('in-1');
    expect(mocks.send.mock.calls[0]?.[0]).toMatchObject({ replyTo: ['sender@example.com'], attachments: [{ filename: 'original.eml', contentType: 'message/rfc822' }] });
  });
});
