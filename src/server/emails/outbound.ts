import { config } from '@/server/config';
import { sendPlunkEmail, upsertPlunkContact } from '@/server/emails/plunk';
import { sendResendEmail } from '@/server/emails/resend';
import { sendPostalEmail } from '@/server/emails/postal';

export type EmailSendProvider = 'plunk' | 'postal' | 'resend';

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
};

export function getEmailSendProvider(): EmailSendProvider {
  if (config.EMAIL_SEND_PROVIDER === 'resend') return 'resend';
  if (config.EMAIL_SEND_PROVIDER === 'postal') return 'postal';
  return 'plunk';
}

async function syncPlunkContactWithoutBlockingSend(email: string): Promise<void> {
  if (!config.PLUNK_SECRET_KEY?.trim()) return;

  try {
    await upsertPlunkContact({
      email,
      data: { source: 'app.yumcut.com' },
    });
  } catch (error) {
    console.error('Failed to synchronize outbound recipient with Plunk', {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendOutboundEmail(input: SendOutboundEmailInput): Promise<OutboundEmailSendResult> {
  const provider = getEmailSendProvider();
  if (provider === 'resend') {
    await syncPlunkContactWithoutBlockingSend(input.to);
    return sendResendEmail(input);
  }

  if (provider === 'postal') {
    return sendPostalEmail(input);
  }

  const response = await sendPlunkEmail({
    ...input,
    data: { source: 'app.yumcut.com' },
  });

  return {
    ok: response.ok,
    ...(response.id ? { id: response.id } : {}),
    ...(response.error ? { error: response.error } : {}),
  };
}
