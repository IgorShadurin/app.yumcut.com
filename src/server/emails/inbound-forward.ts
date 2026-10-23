import { createHash } from 'node:crypto';
import type { CreateEmailOptions } from 'resend';
import { CONTACT_EMAIL } from '@/shared/constants/app';
import { config } from '@/server/config';
import { prisma } from '@/server/db';
import { getReceivedEmail, getResendClient } from '@/server/emails/resend';

// Persist successes beyond Resend's 24-hour idempotency window. Pending sends
// older than 23 hours require reconciliation instead of risking a second copy.
const SAFE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

async function download(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Inbound attachment download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

export async function forwardInboundToContact(emailId: string): Promise<string> {
  const key = `inbound-forward:${createHash('sha256').update(`${emailId}:${CONTACT_EMAIL}`).digest('hex')}`;
  const existing = await prisma.emailDeliveryEvent.findUnique({ where: { providerEventId: key } });
  if (existing?.messageId) return existing.messageId;
  if (existing && Date.now() - existing.createdAt.getTime() >= SAFE_RETRY_WINDOW_MS) {
    throw new Error(`Forward ${emailId} requires reconciliation: provider idempotency window expired`);
  }

  const from = config.RESEND_FROM_EMAIL?.trim();
  if (!from) throw new Error('RESEND_FROM_EMAIL is not configured');
  const resend = getResendClient();
  const email = await getReceivedEmail(emailId);
  const attachments: NonNullable<CreateEmailOptions['attachments']> = [];
  let after: string | undefined;
  do {
    const result = await resend.emails.receiving.attachments.list({ emailId, limit: 100, ...(after ? { after } : {}) });
    if (result.error || !result.data) throw new Error(result.error?.message || 'Unable to list inbound attachments');
    for (const attachment of result.data.data) {
      attachments.push({
        filename: attachment.filename || 'attachment',
        content: await download(attachment.download_url),
        contentType: attachment.content_type,
        ...(attachment.content_id ? { contentId: attachment.content_id.replace(/^<|>$/g, '') } : {}),
      });
    }
    const next = result.data.data.at(-1)?.id;
    if (result.data.has_more && (!next || next === after)) throw new Error('Invalid inbound attachment pagination');
    after = result.data.has_more ? next : undefined;
  } while (after);

  // Never forward the shortened Telegram snippet. Preserve an unparsed message
  // as an .eml so that even unusual MIME bodies remain available to the owner.
  if (!email.text && !email.html) {
    if (!email.raw?.download_url) throw new Error('Inbound email content is unavailable');
    attachments.push({ filename: 'original.eml', content: await download(email.raw.download_url), contentType: 'message/rfc822' });
  }

  const request: CreateEmailOptions = {
    from,
    to: [CONTACT_EMAIL],
    replyTo: email.reply_to?.length ? email.reply_to : [email.from],
    subject: email.subject || '(no subject)',
    headers: {
      'X-Original-From': email.from.replace(/[\r\n]/g, ' '),
      'X-Original-To': (email.to || []).join(', ').replace(/[\r\n]/g, ' '),
    },
    text: email.text || (email.html ? '' : 'Original email attached.'),
    ...(email.html ? { html: email.html } : {}),
    attachments,
  };
  const record = await prisma.emailDeliveryEvent.upsert({
    where: { providerEventId: key },
    create: { provider: 'resend', providerEventId: key, eventType: 'inbound.forward.pending', recipient: CONTACT_EMAIL, details: emailId },
    update: {},
  });
  if (record.messageId) return record.messageId;
  const result = await resend.emails.send(request, { idempotencyKey: key });
  if (result.error || !result.data?.id) throw new Error(result.error?.message || 'Resend did not return a forward ID');
  await prisma.emailDeliveryEvent.update({
    where: { providerEventId: key },
    data: { eventType: 'inbound.forward.sent', messageId: result.data.id },
  });
  return result.data.id;
}
