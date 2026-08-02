import { config } from '@/server/config';
import { sendPlunkEmail, upsertPlunkContact } from '@/server/emails/plunk';
import { sendResendEmail } from '@/server/emails/resend';

export type EmailSendProvider = 'plunk' | 'resend';

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
  return config.EMAIL_SEND_PROVIDER === 'resend' ? 'resend' : 'plunk';
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
  if (getEmailSendProvider() === 'resend') {
    await syncPlunkContactWithoutBlockingSend(input.to);
    return sendResendEmail(input);
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
