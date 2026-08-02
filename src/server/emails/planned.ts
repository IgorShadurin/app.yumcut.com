import crypto from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { prisma } from '@/server/db';
import { config } from '@/server/config';
import { getEmailSendProvider, sendOutboundEmail } from '@/server/emails/outbound';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { shouldQueueFollowUp24hEmail } from '@/server/admin/emails';

export const EMAIL_KIND_WELCOME = 'welcome_v1';
export const EMAIL_KIND_FOLLOW_UP_24H = 'follow_up_24h_v1';
export const EMAIL_KIND_REPLY_BONUS_CONFIRMED = 'reply_bonus_confirmed_v1';
export const EMAIL_KIND_SUBSCRIPTION_WINBACK = 'subscription_cancelled_winback_v1';
export const EMAIL_KIND_PROJECT_CREATED = 'project_created_v1';
export const EMAIL_KIND_PROJECT_READY = 'project_ready_v1';
export const EMAIL_KIND_PROJECT_FAILED = 'project_failed_v1';

const DEFAULT_EMAIL_LANGUAGE = 'en';
const EMAIL_TEMPLATE_ROOT = path.join(process.cwd(), 'email');
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const REPLY_BONUS_ALIAS_PREFIX = 'rb';
const LEGACY_REPLY_BONUS_ALIAS_PREFIX = 'reply-bonus';
const REPLY_BONUS_SIGNATURE_LENGTH = 16;

const MAX_ATTEMPTS = 8;
const DEFAULT_PROCESS_LIMIT = 50;
const DEFAULT_LOCK_STALE_MINUTES = 10;

type SendResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export type LocalizedEmailSendResult = SendResult & {
  language?: string;
};

type ParsedEmailTemplate = {
  language: string;
  subjectTemplate: string;
  textTemplate: string;
};

export type ScheduleUserOnboardingEmailsInput = {
  userId: string;
  email?: string | null;
  name?: string | null;
  targetLanguage?: string | null;
};

type QueueUserOnboardingEmailsOptions = {
  includeFollowUp24h?: boolean;
};

export type ProcessPlannedEmailsOptions = {
  limit?: number;
  userId?: string;
  lockStaleMinutes?: number;
};

export type ProcessPlannedEmailsResult = {
  plannedDue: number;
  plannedPending: number;
  claimed: number;
  sent: number;
  rescheduled: number;
  failed: number;
  skipped: number;
};

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const normalized = trimmed.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? trimmed.replace(/^mailto:/, '');
  if (!normalized.includes('@')) return null;
  if (normalized.endsWith('@guest.yumcut')) return null;
  if (normalized.length > 320) return null;
  return normalized;
}

function parseLanguage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (!normalized) return null;
  const [primary] = normalized.split('-', 1);
  if (!primary || !/^[a-z]{2,8}$/.test(primary)) return null;
  return primary;
}

function normalizeLanguage(value: unknown): string {
  return parseLanguage(value) ?? DEFAULT_EMAIL_LANGUAGE;
}

function defaultGreetingName(language: string): string {
  return language === 'ru' ? '' : 'there';
}

function pickGreetingName(name: string | null | undefined, language: string): string {
  const fallback = defaultGreetingName(language);
  if (!name) return fallback;
  const first = name.trim().split(/\s+/)[0] || '';
  const cleaned = first.replace(/[^\p{L}\p{N}'_-]/gu, '').trim();
  return cleaned || fallback;
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(TEMPLATE_VARIABLE_PATTERN, (_match, key: string) => {
    const value = variables[key];
    return typeof value === 'string' ? value : '';
  });
}

async function loadTemplateMarkdown(language: string, kind: string): Promise<string | null> {
  const filePath = path.join(EMAIL_TEMPLATE_ROOT, language, `${kind}.md`);
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function parseMarkdownTemplate(markdown: string, kind: string, language: string): ParsedEmailTemplate {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n');
  const lines = normalizedMarkdown.split('\n');
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);

  if (headerIndex < 0) {
    throw new Error(`Email template is empty: kind=${kind}, language=${language}`);
  }

  const headerLine = lines[headerIndex].trim();
  const headerMatch = headerLine.match(/^#{1,6}\s+(.+)$/);
  if (!headerMatch) {
    throw new Error(`Email template must start with a markdown heading: kind=${kind}, language=${language}`);
  }

  const subjectTemplate = headerMatch[1].trim();
  if (!subjectTemplate) {
    throw new Error(`Email template subject is empty: kind=${kind}, language=${language}`);
  }

  const bodyLines = lines.slice(headerIndex + 1);
  while (bodyLines.length > 0 && bodyLines[0].trim().length === 0) bodyLines.shift();
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim().length === 0) bodyLines.pop();

  const textTemplate = bodyLines.join('\n').trim();
  if (!textTemplate) {
    throw new Error(`Email template body is empty: kind=${kind}, language=${language}`);
  }

  return {
    language,
    subjectTemplate,
    textTemplate,
  };
}

async function loadLocalizedTemplate(kind: string, languageHint: string): Promise<ParsedEmailTemplate> {
  const preferredLanguage = normalizeLanguage(languageHint);

  const preferredMarkdown = await loadTemplateMarkdown(preferredLanguage, kind);
  if (preferredMarkdown) {
    return parseMarkdownTemplate(preferredMarkdown, kind, preferredLanguage);
  }

  if (preferredLanguage !== DEFAULT_EMAIL_LANGUAGE) {
    const fallbackMarkdown = await loadTemplateMarkdown(DEFAULT_EMAIL_LANGUAGE, kind);
    if (fallbackMarkdown) {
      return parseMarkdownTemplate(fallbackMarkdown, kind, DEFAULT_EMAIL_LANGUAGE);
    }
  }

  throw new Error(`Email template not found for kind=${kind}. Checked languages: ${preferredLanguage}, ${DEFAULT_EMAIL_LANGUAGE}`);
}

function stringifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 4000);
}

function computeRetryDelayMs(nextAttempt: number): number {
  const base = 15 * 60 * 1000;
  const exponential = base * Math.max(1, Math.pow(2, Math.max(0, nextAttempt - 1)));
  return Math.min(exponential, 24 * 60 * 60 * 1000);
}

async function resolveTargetLanguageForUser(userId: string, languageHint?: string | null): Promise<string> {
  const hinted = parseLanguage(languageHint);
  if (hinted) return hinted;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLanguage: true },
  });

  return normalizeLanguage(user?.preferredLanguage);
}

function parseConfiguredFromEmailAddress() {
  const configured = getEmailSendProvider() === 'resend'
    ? (config.RESEND_MARKETING_REPLY_TO_EMAIL?.trim() || config.RESEND_FROM_EMAIL?.trim())
    : config.PLUNK_FROM_EMAIL?.trim();
  return normalizeEmail(configured ?? null);
}

function getReplyBonusSigningSecret() {
  return config.NEXTAUTH_SECRET?.trim()
    || config.RESEND_WEBHOOK_SECRET?.trim()
    || config.PLUNK_SECRET_KEY?.trim()
    || null;
}

export function buildReplyBonusReplyToAddress(userId: string): string | null {
  const fromEmail = parseConfiguredFromEmailAddress();
  const secret = getReplyBonusSigningSecret();
  if (!fromEmail || !secret) return null;

  if (getEmailSendProvider() === 'resend') {
    return fromEmail;
  }

  const domain = fromEmail.split('@')[1];
  if (!domain) return null;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(userId)
    .digest('hex')
    .slice(0, REPLY_BONUS_SIGNATURE_LENGTH);

  return `${REPLY_BONUS_ALIAS_PREFIX}+${userId}.${signature}@${domain}`;
}

export function isResendMarketingReplyAddress(addresses: string[]): boolean {
  if (getEmailSendProvider() !== 'resend') return false;
  const configured = parseConfiguredFromEmailAddress();
  if (!configured) return false;
  return addresses.some((address) => normalizeEmail(address) === configured);
}

export function parseReplyBonusReplyToAddress(addresses: string[]): { userId: string } | null {
  const secret = getReplyBonusSigningSecret();
  if (!secret) return null;

  for (const raw of addresses) {
    const normalized = normalizeEmail(raw);
    if (!normalized) continue;

    const localPart = normalized.split('@')[0] ?? '';
    const match = localPart.match(new RegExp(
      `^(?:${REPLY_BONUS_ALIAS_PREFIX}|${LEGACY_REPLY_BONUS_ALIAS_PREFIX})\\+([a-f0-9-]{36})\\.([a-f0-9]{${REPLY_BONUS_SIGNATURE_LENGTH}})$`,
      'i',
    ));
    if (!match) continue;

    const userId = match[1];
    const signature = match[2]?.toLowerCase();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(userId)
      .digest('hex')
      .slice(0, REPLY_BONUS_SIGNATURE_LENGTH)
      .toLowerCase();

    if (signature === expectedSignature) {
      return { userId };
    }
  }

  return null;
}

async function sendPlainTextEmail(params: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  marketing?: boolean;
  idempotencyKey?: string;
}): Promise<SendResult> {
  return sendOutboundEmail({
    to: params.to,
    subject: params.subject,
    text: params.text,
    replyTo: params.replyTo,
    marketing: params.marketing,
    idempotencyKey: params.idempotencyKey,
  });
}

function isMarketingEmailKind(kind: string): boolean {
  return ![
    EMAIL_KIND_REPLY_BONUS_CONFIRMED,
    EMAIL_KIND_PROJECT_CREATED,
    EMAIL_KIND_PROJECT_READY,
    EMAIL_KIND_PROJECT_FAILED,
  ].includes(kind);
}

function makeTemplateVariables(params: {
  name?: string | null;
  language: string;
  extra?: Record<string, string>;
}) {
  const greetingName = pickGreetingName(params.name, params.language);
  const nameCommaSuffix = greetingName ? `, ${greetingName}` : '';
  const nameSpaceSuffix = greetingName ? ` ${greetingName}` : '';
  const namePrefixComma = greetingName ? `${greetingName}, ` : '';
  const nameForClause = greetingName ? ` для ${greetingName}` : '';
  return {
    name: greetingName,
    name_comma_suffix: nameCommaSuffix,
    name_space_suffix: nameSpaceSuffix,
    name_prefix_comma: namePrefixComma,
    name_for_clause: nameForClause,
    bonus_tokens: String(TOKEN_COSTS.emailReplyBonus),
    ...(params.extra ?? {}),
  };
}

export async function sendLocalizedPlainTextEmail(params: {
  to: string;
  kind: string;
  languageHint?: string | null;
  name?: string | null;
  replyTo?: string | null;
  variables?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<LocalizedEmailSendResult> {
  const languageHint = parseLanguage(params.languageHint) ?? DEFAULT_EMAIL_LANGUAGE;

  try {
    const template = await loadLocalizedTemplate(params.kind, languageHint);
    const variables = makeTemplateVariables({
      name: params.name,
      language: template.language,
      extra: params.variables,
    });

    const sendResult = await sendPlainTextEmail({
      to: params.to,
      subject: fillTemplate(template.subjectTemplate, variables),
      text: fillTemplate(template.textTemplate, variables),
      replyTo: params.replyTo,
      marketing: isMarketingEmailKind(params.kind),
      idempotencyKey: params.idempotencyKey,
    });

    return {
      ...sendResult,
      language: template.language,
    };
  } catch (error) {
    return {
      ok: false,
      error: stringifyError(error),
    };
  }
}

export async function queueUserOnboardingEmails(
  input: ScheduleUserOnboardingEmailsInput,
  options: QueueUserOnboardingEmailsOptions = {},
): Promise<boolean> {
  const email = normalizeEmail(input.email);
  if (!email) {
    return false;
  }

  const targetLanguage = await resolveTargetLanguageForUser(input.userId, input.targetLanguage);
  const now = new Date();
  const followUpAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const data: Array<{
    userId: string;
    email: string;
    kind: string;
    targetLanguage: string;
    scheduledAt: Date;
  }> = [];

  data.push({
    userId: input.userId,
    email,
    kind: EMAIL_KIND_WELCOME,
    targetLanguage,
    scheduledAt: now,
  });

  if (options.includeFollowUp24h ?? true) {
    data.push({
      userId: input.userId,
      email,
      kind: EMAIL_KIND_FOLLOW_UP_24H,
      targetLanguage,
      scheduledAt: followUpAt,
    });
  }

  await prisma.plannedEmail.createMany({
    data,
    skipDuplicates: true,
  });

  return true;
}

export async function cancelPlannedEmailsForUser(
  userId: string,
  db: Pick<typeof prisma, 'plannedEmail'> = prisma,
): Promise<number> {
  const result = await db.plannedEmail.deleteMany({ where: { userId } });
  return result.count;
}

export async function processPlannedEmails(options: ProcessPlannedEmailsOptions = {}): Promise<ProcessPlannedEmailsResult> {
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit as number)) : DEFAULT_PROCESS_LIMIT;
  const lockStaleMinutes = Number.isFinite(options.lockStaleMinutes)
    ? Math.max(1, Math.floor(options.lockStaleMinutes as number))
    : DEFAULT_LOCK_STALE_MINUTES;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - lockStaleMinutes * 60 * 1000);
  const lockId = crypto.randomUUID();
  const basePendingWhere = {
    status: 'pending' as const,
    ...(options.userId ? { userId: options.userId } : {}),
  };
  const duePendingWhere = {
    ...basePendingWhere,
    scheduledAt: { lte: now },
  };

  const [plannedPending, plannedDue] = await Promise.all([
    prisma.plannedEmail.count({ where: basePendingWhere }),
    prisma.plannedEmail.count({ where: duePendingWhere }),
  ]);

  const claimed = await prisma.$transaction(async (tx) => {
    const due = await tx.plannedEmail.findMany({
      where: {
        ...duePendingWhere,
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: [
        { scheduledAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
      select: { id: true },
    });

    if (due.length === 0) {
      return [] as Array<{
        id: string;
        userId: string;
        email: string;
        kind: string;
        subject: string | null;
        text: string | null;
        attempts: number;
        targetLanguage: string;
        user: { preferredLanguage: string; name: string | null; deleted: boolean } | null;
      }>;
    }

    const ids = due.map((item) => item.id);

    await tx.plannedEmail.updateMany({
      where: {
        id: { in: ids },
        status: 'pending',
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: staleBefore } },
        ],
      },
      data: {
        lockId,
        lockedAt: now,
      },
    });

    return tx.plannedEmail.findMany({
      where: { lockId, status: 'pending' },
      select: {
        id: true,
        userId: true,
        email: true,
        kind: true,
        subject: true,
        text: true,
        attempts: true,
        targetLanguage: true,
        user: {
          select: {
            preferredLanguage: true,
            name: true,
            deleted: true,
          },
        },
      },
      orderBy: [
        { scheduledAt: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  });

  const result: ProcessPlannedEmailsResult = {
    plannedDue,
    plannedPending,
    claimed: claimed.length,
    sent: 0,
    rescheduled: 0,
    failed: 0,
    skipped: 0,
  };

  for (const planned of claimed) {
    if (!planned.user || planned.user.deleted) {
      await prisma.plannedEmail.deleteMany({
        where: { id: planned.id, lockId, status: 'pending' },
      });
      result.skipped += 1;
      continue;
    }

    const languageHint = parseLanguage(planned.user?.preferredLanguage)
      ?? parseLanguage(planned.targetLanguage)
      ?? DEFAULT_EMAIL_LANGUAGE;

    let resolvedLanguage = normalizeLanguage(languageHint);
    let sendResult: SendResult;

    try {
      if (planned.subject && planned.text) {
        sendResult = await sendPlainTextEmail({
          to: planned.email,
          subject: planned.subject,
          text: planned.text,
          marketing: true,
          idempotencyKey: planned.id,
        });
      } else {
        const replyTo = planned.kind === EMAIL_KIND_WELCOME || planned.kind === EMAIL_KIND_FOLLOW_UP_24H
          ? buildReplyBonusReplyToAddress(planned.userId)
          : null;

        const localizedResult = await sendLocalizedPlainTextEmail({
          to: planned.email,
          kind: planned.kind,
          languageHint,
          name: planned.user?.name,
          replyTo,
          idempotencyKey: planned.id,
        });
        resolvedLanguage = localizedResult.language ?? resolvedLanguage;
        sendResult = localizedResult;
      }
    } catch (error) {
      sendResult = {
        ok: false,
        error: stringifyError(error),
      };
    }

    if (sendResult.ok) {
      const updated = await prisma.plannedEmail.updateMany({
        where: { id: planned.id, lockId, status: 'pending' },
        data: {
          status: 'sent',
          targetLanguage: resolvedLanguage,
          sentAt: new Date(),
          lastError: null,
          lockId: null,
          lockedAt: null,
          attempts: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        result.skipped += 1;
      } else {
        result.sent += 1;
      }
      continue;
    }

    const nextAttempt = planned.attempts + 1;
    const terminalFailure = nextAttempt >= MAX_ATTEMPTS;
    const nextSchedule = new Date(Date.now() + computeRetryDelayMs(nextAttempt));

    const updated = await prisma.plannedEmail.updateMany({
      where: { id: planned.id, lockId, status: 'pending' },
      data: {
        status: terminalFailure ? 'failed' : 'pending',
        targetLanguage: resolvedLanguage,
        scheduledAt: terminalFailure ? now : nextSchedule,
        lastError: (sendResult.error || 'Unknown email send error').slice(0, 4000),
        lockId: null,
        lockedAt: null,
        attempts: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      result.skipped += 1;
      continue;
    }

    if (terminalFailure) {
      result.failed += 1;
    } else {
      result.rescheduled += 1;
    }
  }

  return result;
}

export async function scheduleUserOnboardingEmails(input: ScheduleUserOnboardingEmailsInput): Promise<{ queued: boolean; processed: ProcessPlannedEmailsResult | null }> {
  const includeFollowUp24h = await shouldQueueFollowUp24hEmail();
  const queued = await queueUserOnboardingEmails(input, { includeFollowUp24h });
  if (!queued) {
    return { queued: false, processed: null };
  }

  const processed = await processPlannedEmails({
    limit: 10,
    userId: input.userId,
  });

  return { queued: true, processed };
}
