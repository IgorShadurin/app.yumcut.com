#!/usr/bin/env node
import path from 'node:path';
import dotenv from 'dotenv';
import { Resend } from 'resend';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type CliArgs = {
  emailId: string;
  text: string;
};

function parseCliArgs(argv: string[]): CliArgs {
  let emailId = '';
  let text = '';
  let collectTextFromIndex = -1;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (!arg) continue;

    if (arg.startsWith('--id=')) {
      emailId = arg.slice('--id='.length).trim();
      continue;
    }

    if (arg === '--id' && argv[i + 1]) {
      emailId = (argv[i + 1] ?? '').trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--text=')) {
      text = arg.slice('--text='.length);
      continue;
    }

    if (arg === '--text') {
      collectTextFromIndex = i + 1;
      break;
    }
  }

  if (!emailId && argv[0]) {
    emailId = argv[0].trim();
  }

  if (collectTextFromIndex >= 0) {
    text = argv.slice(collectTextFromIndex).join(' ').trim();
  } else if (!text && argv.length >= 2) {
    text = argv.slice(1).join(' ').trim();
  }

  if (!emailId || !text) {
    console.error('Usage: npm run answer-email -- <email-id> "<text>"');
    console.error('   or: npm run answer-email -- --id=<email-id> --text="<text>"');
    process.exit(1);
  }

  return { emailId, text };
}

function ensureReSubject(subject: string | null | undefined): string {
  const value = (subject ?? '').trim();
  if (!value) return 'Re:';
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

function parseReferencesHeader(value: unknown): string | null {
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item).trim()).filter(Boolean).join(' ');
    return joined || null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('[')) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return trimmed;
    const joined = parsed.map((item) => String(item).trim()).filter(Boolean).join(' ');
    return joined || null;
  } catch {
    return trimmed;
  }
}

function appendReference(base: string | null, messageId: string | null | undefined): string | null {
  const normalizedMessageId = messageId?.trim();
  if (!normalizedMessageId) return base;
  if (!base) return normalizedMessageId;
  return `${base} ${normalizedMessageId}`;
}

async function main() {
  const { sendPlunkEmail } = await import('../src/server/emails/plunk');
  const { emailId, text } = parseCliArgs(process.argv.slice(2));
  const apiKey = (process.env.RESEND_FULL_ACCESS || process.env.RESEND_API_KEY || '').trim();

  if (!apiKey) {
    throw new Error('RESEND_FULL_ACCESS or RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey);
  const inbound = await resend.emails.receiving.get(emailId);

  if (inbound.error || !inbound.data) {
    throw new Error(inbound.error?.message || `Unable to load message ${emailId}`);
  }

  const replyTo = (inbound.data.from || '').trim();
  if (!replyTo) {
    throw new Error(`Inbound message ${emailId} does not include a sender address.`);
  }

  const subject = ensureReSubject(inbound.data.subject);
  const inReplyTo = inbound.data.message_id?.trim() || null;
  const references = appendReference(
    parseReferencesHeader(inbound.data.headers?.references),
    inReplyTo,
  );

  const sendResult = await sendPlunkEmail({
    to: replyTo,
    subject,
    text,
    marketing: false,
    headers: {
      ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}),
      ...(references ? { References: references } : {}),
    },
  });

  if (!sendResult.ok || !sendResult.id) {
    throw new Error(sendResult.error || 'Failed to send');
  }

  console.log(JSON.stringify({
    ok: true,
    id: sendResult.id,
    messageId: emailId,
  }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
