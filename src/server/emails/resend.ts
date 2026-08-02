import { Resend, WebhookEventPayload } from 'resend';
import { config } from '@/server/config';

const DEFAULT_MARKETING_EVENT_NAME = 'yumcut.marketing.email.v1';
const MAX_AUTOMATION_BODY_CHUNKS = 10;
const MAX_AUTOMATION_CHUNK_LENGTH = 2_000;

export type SendResendEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  marketing?: boolean;
  idempotencyKey?: string;
};

export type ResendSendResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  const apiKey = config.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function stringifyError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}

function configuredSender(): string {
  const from = config.RESEND_FROM_EMAIL?.trim();
  if (!from) {
    throw new Error('RESEND_FROM_EMAIL is not configured.');
  }
  return from;
}

function marketingEventName(): string {
  return config.RESEND_MARKETING_EVENT_NAME?.trim() || DEFAULT_MARKETING_EVENT_NAME;
}

export function splitResendAutomationBody(text: string): Record<string, string> {
  if (text.length > MAX_AUTOMATION_BODY_CHUNKS * MAX_AUTOMATION_CHUNK_LENGTH) {
    throw new Error(`Resend marketing email text cannot exceed ${MAX_AUTOMATION_BODY_CHUNKS * MAX_AUTOMATION_CHUNK_LENGTH} characters.`);
  }

  return Object.fromEntries(Array.from({ length: MAX_AUTOMATION_BODY_CHUNKS }, (_unused, index) => {
    const start = index * MAX_AUTOMATION_CHUNK_LENGTH;
    const key = `body_${String(index + 1).padStart(2, '0')}`;
    return [key, text.slice(start, start + MAX_AUTOMATION_CHUNK_LENGTH)];
  }));
}

export async function sendResendEmail(input: SendResendEmailInput): Promise<ResendSendResult> {
  try {
    const resend = getResendClient();

    if (input.marketing) {
      const response = await resend.events.send({
        event: marketingEventName(),
        email: input.to,
        payload: {
          subject: input.subject,
          ...splitResendAutomationBody(input.text),
          ...(input.idempotencyKey ? { source_id: input.idempotencyKey } : {}),
        },
      });

      if (response.error) {
        return { ok: false, error: response.error.message };
      }

      return {
        ok: true,
        id: input.idempotencyKey
          ? `resend-event:${input.idempotencyKey}`
          : `resend-event:${marketingEventName()}`,
      };
    }

    const response = await resend.emails.send({
      from: configuredSender(),
      to: [input.to],
      ...(input.replyTo ? { replyTo: [input.replyTo] } : {}),
      subject: input.subject,
      text: input.text,
    }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);

    if (response.error || !response.data?.id) {
      return {
        ok: false,
        error: response.error?.message || 'Resend did not return a sent email ID.',
      };
    }

    return { ok: true, id: response.data.id };
  } catch (error) {
    return { ok: false, error: stringifyError(error) };
  }
}

export function verifyResendWebhook(payload: string, headers: Headers): WebhookEventPayload | null {
  const webhookSecret = config.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return null;
  }

  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signature = headers.get('svix-signature');
  if (!id || !timestamp || !signature) {
    return null;
  }

  try {
    const resend = getResendClient();
    return resend.webhooks.verify({
      payload,
      headers: {
        id,
        timestamp,
        signature,
      },
      webhookSecret,
    });
  } catch {
    return null;
  }
}

export async function getReceivedEmail(emailId: string) {
  const resend = getResendClient();
  const response = await resend.emails.receiving.get(emailId);
  if (response.error || !response.data) {
    const message = response.error?.message || `Unable to fetch received email ${emailId}`;
    throw new Error(message);
  }
  return response.data;
}
