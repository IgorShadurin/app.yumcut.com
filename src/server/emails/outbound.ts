import { config } from '@/server/config';
import { sendResendEmail } from '@/server/emails/resend';
import { sendPostalEmail } from '@/server/emails/postal';
import { ensureEmailContact } from '@/server/emails/contacts';

export type EmailSendProvider = 'postal' | 'resend';

export type SendOutboundEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  marketing?: boolean;
  idempotencyKey?: string;
};

export type OutboundEmailSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
  reason?: 'unsubscribed' | 'suppressed';
};

export function getEmailSendProvider(): EmailSendProvider {
  if (config.EMAIL_SEND_PROVIDER === 'resend') return 'resend';
  return 'postal';
}

async function syncLocalContactWithoutBlockingResend(email: string): Promise<void> {
  try {
    await ensureEmailContact({
      email,
      subscribedOnCreate: false,
      consentSource: 'resend-delivery',
    });
  } catch (error) {
    console.error('Failed to synchronize Resend recipient with local email contacts', {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendOutboundEmail(input: SendOutboundEmailInput): Promise<OutboundEmailSendResult> {
  const provider = getEmailSendProvider();
  if (provider === 'resend') {
    await syncLocalContactWithoutBlockingResend(input.to);
    return sendResendEmail(input);
  }

  return sendPostalEmail(input);
}
