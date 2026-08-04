import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: { EMAIL_SEND_PROVIDER: 'postal' as 'postal' | 'resend' },
  ensureContact: vi.fn(),
  postalSend: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock('@/server/config', () => ({ config: state.config }));
vi.mock('@/server/emails/contacts', () => ({ ensureEmailContact: state.ensureContact }));
vi.mock('@/server/emails/resend', () => ({ sendResendEmail: state.resendSend }));
vi.mock('@/server/emails/postal', () => ({ sendPostalEmail: state.postalSend }));

const { sendOutboundEmail } = await import('@/server/emails/outbound');

describe('sendOutboundEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.config.EMAIL_SEND_PROVIDER = 'postal';
    state.ensureContact.mockResolvedValue({ id: 'contact-1' });
    state.postalSend.mockResolvedValue({ ok: true, id: 'postal-email-1' });
    state.resendSend.mockResolvedValue({ ok: true, id: 'resend-email-1' });
  });

  it('uses Postal by default', async () => {
    const input = { to: 'user@example.com', subject: 'Subject', text: 'Body', marketing: true };
    await expect(sendOutboundEmail(input)).resolves.toEqual({ ok: true, id: 'postal-email-1' });
    expect(state.postalSend).toHaveBeenCalledWith(input);
    expect(state.resendSend).not.toHaveBeenCalled();
  });

  it('uses Resend and records an unknown recipient locally without granting consent', async () => {
    state.config.EMAIL_SEND_PROVIDER = 'resend';
    const input = { to: 'user@example.com', subject: 'Subject', text: 'Body', marketing: true };
    await expect(sendOutboundEmail(input)).resolves.toEqual({ ok: true, id: 'resend-email-1' });
    expect(state.ensureContact).toHaveBeenCalledWith({
      email: 'user@example.com',
      subscribedOnCreate: false,
      consentSource: 'resend-delivery',
    });
    expect(state.resendSend).toHaveBeenCalledWith(input);
  });

  it('does not block Resend if the local audit sync fails', async () => {
    state.config.EMAIL_SEND_PROVIDER = 'resend';
    state.ensureContact.mockRejectedValue(new Error('Database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(sendOutboundEmail({ to: 'user@example.com', subject: 'Subject', text: 'Body' }))
      .resolves.toEqual({ ok: true, id: 'resend-email-1' });
  });
});
