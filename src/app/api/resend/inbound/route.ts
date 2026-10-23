import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { ok, forbidden, error } from '@/server/http';
import { config } from '@/server/config';
import { getReceivedEmail, verifyResendWebhook } from '@/server/emails/resend';
import { extractLatestEmailReply } from '@/server/emails/reply-parser';
import { processInboundReplyBonus } from '@/server/emails/reply-bonus';
import { notifyAdminsWithMessage } from '@/server/telegram';
import { persistInboundFeedback } from '@/server/admin/feedbacks';
import { forwardInboundToContact } from '@/server/emails/inbound-forward';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResendReceivedEmail = Awaited<ReturnType<typeof getReceivedEmail>> & {
  raw?: {
    download_url?: string | null;
    expires_at?: string | null;
  } | null;
  html?: string | null;
  text?: string | null;
};

function trimTo(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|blockquote|h[1-6])>/gi, '\n')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function toSnippet(input: { text?: string | null; html?: string | null }): string {
  const rawBody = input.text?.trim()
    ? input.text
    : input.html?.trim()
      ? stripHtml(input.html)
      : '';
  const latestReply = extractLatestEmailReply(rawBody || '');
  return normalizeWhitespace(latestReply).slice(0, 900);
}

function decodeQuotedPrintable(input: string): string {
  const softLineBreaksRemoved = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < softLineBreaksRemoved.length; i += 1) {
    const char = softLineBreaksRemoved[i] ?? '';
    const maybeHex = softLineBreaksRemoved.slice(i + 1, i + 3);

    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(maybeHex)) {
      bytes.push(Number.parseInt(maybeHex, 16));
      i += 2;
      continue;
    }

    bytes.push(char.charCodeAt(0));
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes));
}

function decodeBodyByTransferEncoding(body: string, transferEncoding: string): string {
  const encoding = transferEncoding.trim().toLowerCase();

  if (encoding.includes('quoted-printable')) {
    return decodeQuotedPrintable(body);
  }

  if (encoding.includes('base64')) {
    try {
      const compact = body.replace(/\s+/g, '');
      return Buffer.from(compact, 'base64').toString('utf8');
    } catch {
      return body;
    }
  }

  return body;
}

function extractRawMimeBodies(rawMime: string): { text: string | null; html: string | null } {
  const normalized = rawMime.replace(/\r\n/g, '\n');
  const plainParts: string[] = [];
  const htmlParts: string[] = [];

  const partRegex =
    /Content-Type:\s*(text\/plain|text\/html)[^\n]*\n([\s\S]*?)\n\n([\s\S]*?)(?=\n--[^\n]+|$)/gi;

  let match: RegExpExecArray | null = partRegex.exec(normalized);
  while (match) {
    const contentType = match[1]?.toLowerCase() ?? '';
    const headersBlock = match[2] ?? '';
    const bodyBlock = match[3] ?? '';
    const transferEncoding =
      headersBlock.match(/Content-Transfer-Encoding:\s*([^\n]+)/i)?.[1] ?? '7bit';
    const decodedBody = decodeBodyByTransferEncoding(bodyBlock, transferEncoding).trim();

    if (decodedBody) {
      if (contentType === 'text/plain') {
        plainParts.push(decodedBody);
      } else {
        htmlParts.push(decodedBody);
      }
    }

    match = partRegex.exec(normalized);
  }

  if (plainParts.length === 0 && htmlParts.length === 0) {
    const separatorIndex = normalized.indexOf('\n\n');
    if (separatorIndex !== -1) {
      const topHeaders = normalized.slice(0, separatorIndex);
      const topBody = normalized.slice(separatorIndex + 2);
      const topContentType = topHeaders.match(/Content-Type:\s*([^\n;]+)/i)?.[1]?.toLowerCase();

      if (topContentType === 'text/plain' || topContentType === 'text/html') {
        const transferEncoding =
          topHeaders.match(/Content-Transfer-Encoding:\s*([^\n]+)/i)?.[1] ?? '7bit';
        const decodedTopBody = decodeBodyByTransferEncoding(topBody, transferEncoding).trim();

        if (decodedTopBody) {
          if (topContentType === 'text/plain') {
            plainParts.push(decodedTopBody);
          } else {
            htmlParts.push(decodedTopBody);
          }
        }
      }
    }
  }

  return {
    text: plainParts.join('\n\n').trim() || null,
    html: htmlParts.join('\n\n').trim() || null,
  };
}

async function readRawMimeBodies(downloadUrl: string): Promise<{
  text: string | null;
  html: string | null;
} | null> {
  try {
    const response = await fetch(downloadUrl, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }

    const rawMime = await response.text();
    return extractRawMimeBodies(rawMime);
  } catch {
    return null;
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchReceivedEmailWithRetry(emailId: string): Promise<{
  email: ResendReceivedEmail | null;
  errorMessage: string | null;
}> {
  const retryDelaysMs = process.env.NODE_ENV === 'test' ? [0, 0, 0] : [0, 500, 1200];
  let lastErrorMessage: string | null = null;

  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const email = (await getReceivedEmail(emailId)) as ResendReceivedEmail;
      return { email, errorMessage: null };
    } catch (err) {
      lastErrorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    email: null,
    errorMessage: lastErrorMessage,
  };
}

export const POST = withApiError(async function POST(req: NextRequest) {
  if (!config.RESEND_WEBHOOK_SECRET?.trim()) {
    return forbidden('Resend webhook secret is not configured');
  }

  const rawBody = await req.text();
  const event = verifyResendWebhook(rawBody, req.headers);
  if (!event) {
    return forbidden('Invalid Resend webhook signature');
  }

  if (event.type !== 'email.received') {
    return ok({ ok: true, ignored: true, type: event.type });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    return error('BAD_REQUEST', 'Missing email_id in webhook payload', 400);
  }

  const fetchResult = await fetchReceivedEmailWithRetry(emailId);
  const received = fetchResult.email;

  const from = (received?.from || event.data?.from || '').trim() || 'unknown';
  const to = received?.to?.length ? received.to : asStringArray(event.data?.to);
  const subject = (received?.subject || event.data?.subject || '').trim() || '(no subject)';
  const eventData = event.data as (typeof event.data & { text?: string | null; html?: string | null }) | undefined;

  const apiSnippet = toSnippet({
    text: received?.text ?? eventData?.text ?? null,
    html: received?.html ?? eventData?.html ?? null,
  });

  const rawDownloadUrl = received?.raw?.download_url?.trim() ?? '';
  let rawMimeSnippet = '';
  if (!apiSnippet && rawDownloadUrl) {
    const rawBodies = await readRawMimeBodies(rawDownloadUrl);
    rawMimeSnippet = toSnippet({
      text: rawBodies?.text ?? null,
      html: rawBodies?.html ?? null,
    });
  }

  const textBody = apiSnippet || rawMimeSnippet;
  const replyBonusResult = await processInboundReplyBonus({
    from,
    to,
    emailId,
  });

  const lines = [
    '📨 Incoming email for YumCut (app.yumcut.com)',
    `From: ${trimTo(from, 320)}`,
    `To: ${to.length > 0 ? trimTo(to.join(', '), 500) : '—'}`,
    `Subject: ${trimTo(subject, 255)}`,
    '',
    'Text:',
    textBody ? trimTo(textBody, 3000) : 'No parsed text content available in this email.',
    '',
    `Email ID: ${emailId}`,
  ];

  if (replyBonusResult.granted) {
    lines.push(`Reply bonus: granted ${replyBonusResult.balance ?? '—'} balance (${replyBonusResult.userId})`);
    if (replyBonusResult.confirmationSent === false && replyBonusResult.confirmationError) {
      lines.push(`Reply bonus confirmation email error: ${trimTo(replyBonusResult.confirmationError, 500)}`);
    }
  } else if (replyBonusResult.alreadyGranted) {
    lines.push(`Reply bonus: already granted (${replyBonusResult.userId ?? 'unknown user'})`);
  } else if (replyBonusResult.eligible || replyBonusResult.reason === 'sender_mismatch') {
    lines.push(`Reply bonus: skipped (${replyBonusResult.reason ?? 'unknown'})`);
  }

  if (fetchResult.errorMessage) {
    lines.push(`Note: failed to fetch full inbound payload from Resend: ${trimTo(fetchResult.errorMessage, 500)}`);
  }

  let telegramForwardError: string | null = null;
  try {
    await notifyAdminsWithMessage(lines.join('\n'));
  } catch (err) {
    telegramForwardError = err instanceof Error ? err.message : String(err);
    console.error('Failed to forward inbound email to Telegram admins', { emailId, err });
  }

  await persistInboundFeedback({
    emailId,
    from,
    to,
    subject,
    latestReplyText: textBody,
    snippetSource: apiSnippet ? 'api' : rawMimeSnippet ? 'raw' : 'none',
    userId: replyBonusResult.userId ?? null,
    replyBonus: replyBonusResult,
    inboundFetchError: fetchResult.errorMessage ? trimTo(fetchResult.errorMessage, 500) : null,
    telegramForwardError: telegramForwardError ? trimTo(telegramForwardError, 500) : null,
    enriched: Boolean(received),
    forwardedToTelegram: !telegramForwardError,
  });

  // Keep the existing side effects even when Gmail forwarding fails. A non-2xx
  // response lets Resend retry; forwarding has its own durable deduplication.
  let forwardedEmailId: string;
  try {
    forwardedEmailId = await forwardInboundToContact(emailId);
  } catch (err) {
    console.error('Failed to forward inbound email to contact', { emailId, err });
    return error('INBOUND_FORWARD_FAILED', 'Unable to forward inbound email; retry required', 503);
  }

  return ok({
    ok: true,
    emailId,
    forwardedToEmail: true,
    forwardedEmailId,
    enriched: Boolean(received),
    snippetSource: apiSnippet ? 'api' : rawMimeSnippet ? 'raw' : 'none',
    forwardedToTelegram: !telegramForwardError,
    replyBonus: replyBonusResult,
    ...(fetchResult.errorMessage ? { inboundFetchError: trimTo(fetchResult.errorMessage, 500) } : {}),
    ...(telegramForwardError ? { telegramForwardError: trimTo(telegramForwardError, 500) } : {}),
  });
}, 'Failed to process inbound Resend webhook');
