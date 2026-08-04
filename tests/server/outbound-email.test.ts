import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: {
    EMAIL_SEND_PROVIDER: 'plunk' as 'plunk' | 'postal' | 'resend',
    PLUNK_SECRET_KEY: 'plunk-secret',
  },
  plunkSend: vi.fn(),
  plunkUpsert: vi.fn(),
  postalSend: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/emails/plunk', () => ({
  sendPlunkEmail: state.plunkSend,
  upsertPlunkContact: state.plunkUpsert,
}));
vi.mock('@/server/emails/resend', () => ({ sendResendEmail: state.resendSend }));
vi.mock('@/server/emails/postal', () => ({ sendPostalEmail: state.postalSend }));

const { sendOutboundEmail } = await import('@/server/emails/outbound');

describe('sendOutboundEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.config.EMAIL_SEND_PROVIDER = 'plunk';
    state.plunkSend.mockResolvedValue({ ok: true, id: 'plunk-email-1' });
    state.plunkUpsert.mockResolvedValue({ id: 'plunk-contact-1' });
    state.postalSend.mockResolvedValue({ ok: true, id: 'postal-email-1' });
    state.resendSend.mockResolvedValue({ ok: true, id: 'resend-email-1' });
  });

  it('uses Plunk for delivery when selected', async () => {
    await expect(sendOutboundEmail({
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      marketing: true,
    })).resolves.toEqual({ ok: true, id: 'plunk-email-1' });

    expect(state.plunkSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      marketing: true,
      data: { source: 'app.yumcut.com' },
    }));
    expect(state.resendSend).not.toHaveBeenCalled();
  });

  it('uses Resend while still synchronizing the recipient to Plunk', async () => {
    state.config.EMAIL_SEND_PROVIDER = 'resend';
    const input = {
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      marketing: true,
      idempotencyKey: 'planned-1',
    };

    await expect(sendOutboundEmail(input)).resolves.toEqual({ ok: true, id: 'resend-email-1' });

    expect(state.plunkUpsert).toHaveBeenCalledWith({
      email: 'user@example.com',
      data: { source: 'app.yumcut.com' },
    });
    expect(state.resendSend).toHaveBeenCalledWith(input);
    expect(state.plunkSend).not.toHaveBeenCalled();
  });

  it('uses Postal when selected', async () => {
    state.config.EMAIL_SEND_PROVIDER = 'postal';
    const input = {
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
      marketing: true,
      idempotencyKey: 'planned-1',
    };

    await expect(sendOutboundEmail(input)).resolves.toEqual({ ok: true, id: 'postal-email-1' });

    expect(state.postalSend).toHaveBeenCalledWith(input);
    expect(state.plunkSend).not.toHaveBeenCalled();
    expect(state.resendSend).not.toHaveBeenCalled();
  });

  it('does not block Resend delivery when Plunk contact sync fails', async () => {
    state.config.EMAIL_SEND_PROVIDER = 'resend';
    state.plunkUpsert.mockRejectedValue(new Error('Plunk unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(sendOutboundEmail({
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Body',
    })).resolves.toEqual({ ok: true, id: 'resend-email-1' });
  });
});
