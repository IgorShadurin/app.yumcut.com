import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { emailAudience, normalizeEmailContactAddress } from '@/server/emails/contacts';
import {
  sendPostalEmail,
  sendPostalMarketingTestEmail,
  type PostalSendResult,
  type SendPostalEmailInput,
} from '@/server/emails/postal';

const DEFAULT_DELAY_MS = 2_000;
const MIN_DELAY_MS = 250;
const MAX_DELAY_MS = 60_000;
const MAX_SUBJECT_LENGTH = 512;
const MAX_TEXT_LENGTH = 100_000;
const DELIVERY_LOOKUP_BATCH_SIZE = 500;

export const POSTAL_MARKETING_CAMPAIGN_USAGE = `Usage:
  npm run emails:campaign -- --all [--language <code>] --campaign-id <id> --subject <subject> (--text <text> | --text-file <path>) --dry-run
  npm run emails:campaign -- --to <email> [--to <email> ...] --campaign-id <id> --subject <subject> (--text <text> | --text-file <path>) --dry-run

Replace --dry-run with --confirm-send to send. The default delay is 2000 ms.
Only locally subscribed, non-suppressed contacts are eligible for normal delivery.
Explicit non-suppressed YumCut admin addresses may be used as test recipients.`;

export type PostalMarketingCampaignOptions = {
  all: boolean;
  recipients: string[];
  campaignId: string;
  language: string | null;
  subject: string;
  text: string;
  delayMs: number;
  dryRun: boolean;
  retryFailed: boolean;
};

export type PostalMarketingCampaignResult = {
  audience: string;
  language: string | null;
  requested: number | 'all';
  eligible: number;
  ineligible: number;
  alreadyProcessed: number;
  selected: number;
  sent: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
};

type CampaignContact = {
  id: string;
  email: string;
  marketingSubscribed: boolean;
  suppressedAt: Date | null;
  createdAt: Date;
  allowUnsubscribedMarketingTest: boolean;
};

type DeliveryRow = {
  providerEventId: string;
  eventType: string;
};

type CampaignSendInput = SendPostalEmailInput & {
  allowUnsubscribedMarketingTest: boolean;
};

type CampaignDependencies = {
  findContacts: (input: {
    all: boolean;
    recipients: string[];
    audience: string;
    language: string | null;
  }) => Promise<CampaignContact[]>;
  findDeliveries: (providerEventIds: string[]) => Promise<DeliveryRow[]>;
  claimDelivery: (input: {
    providerEventId: string;
    recipient: string;
    campaignId: string;
    retryFailed: boolean;
  }) => Promise<boolean>;
  finishDelivery: (input: {
    providerEventId: string;
    eventType: 'CampaignSent' | 'CampaignSkipped' | 'CampaignFailed';
    messageId?: string | null;
    details: string;
  }) => Promise<void>;
  send: (input: CampaignSendInput) => Promise<PostalSendResult>;
  sleep: (milliseconds: number) => Promise<void>;
  log: (message: string) => void;
};

function optionValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === name) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
      values.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
  }
  return values;
}

function oneOption(args: string[], name: string): string | undefined {
  const values = optionValues(args, name);
  if (values.length > 1) throw new Error(`${name} may only be passed once.`);
  return values[0];
}

function validateKnownArguments(args: string[]): void {
  const flags = new Set(['--all', '--dry-run', '--confirm-send', '--retry-failed', '--help']);
  const options = new Set(['--to', '--campaign-id', '--language', '--subject', '--text', '--text-file', '--delay-ms']);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (flags.has(arg)) continue;
    const optionName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (!options.has(optionName)) throw new Error(`Unknown argument: ${arg}`);
    if (!arg.includes('=')) index += 1;
  }
}

function parseDelay(value: string | undefined): number {
  if (!value) return DEFAULT_DELAY_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_DELAY_MS || parsed > MAX_DELAY_MS) {
    throw new Error(`--delay-ms must be an integer between ${MIN_DELAY_MS} and ${MAX_DELAY_MS}.`);
  }
  return parsed;
}

function parseCampaignId(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized)) {
    throw new Error('--campaign-id must contain 3-64 lowercase letters, numbers, dots, underscores, or hyphens.');
  }
  return normalized;
}

function parseLanguage(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
  if (!/^[a-z]{2,8}$/.test(normalized)) {
    throw new Error('--language must be a valid language code such as en or ru.');
  }
  return normalized;
}

function parseRecipients(values: string[]): string[] {
  const normalized = values
    .flatMap((value) => value.split(','))
    .map((value) => normalizeEmailContactAddress(value))
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(normalized)];
  const suppliedCount = values.flatMap((value) => value.split(',')).filter((value) => value.trim()).length;
  if (unique.length !== suppliedCount) throw new Error('Every --to value must be a valid, unique non-guest email address.');
  return unique;
}

export async function parsePostalMarketingCampaignArgs(
  args: string[],
  cwd = process.cwd(),
): Promise<PostalMarketingCampaignOptions> {
  validateKnownArguments(args);
  const all = args.includes('--all');
  const recipients = parseRecipients(optionValues(args, '--to'));
  if (all === (recipients.length > 0)) throw new Error('Pass exactly one of --all or at least one --to EMAIL.');

  const dryRun = args.includes('--dry-run');
  const confirmSend = args.includes('--confirm-send');
  if (dryRun === confirmSend) throw new Error('Pass exactly one of --dry-run or --confirm-send.');

  const subject = oneOption(args, '--subject')?.trim() ?? '';
  if (!subject || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    throw new Error(`--subject is required, must be one line, and must not exceed ${MAX_SUBJECT_LENGTH} characters.`);
  }

  const inlineText = oneOption(args, '--text');
  const textFile = oneOption(args, '--text-file');
  if (Boolean(inlineText) === Boolean(textFile)) throw new Error('Pass exactly one of --text or --text-file.');
  const text = textFile
    ? await readFile(path.resolve(cwd, textFile), 'utf8')
    : inlineText ?? '';
  const normalizedText = text.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) throw new Error('Campaign text cannot be empty.');
  if (normalizedText.length > MAX_TEXT_LENGTH) throw new Error(`Campaign text cannot exceed ${MAX_TEXT_LENGTH} characters.`);

  return {
    all,
    recipients,
    campaignId: parseCampaignId(oneOption(args, '--campaign-id')),
    language: parseLanguage(oneOption(args, '--language')),
    subject,
    text: normalizedText,
    delayMs: parseDelay(oneOption(args, '--delay-ms')),
    dryRun,
    retryFailed: args.includes('--retry-failed'),
  };
}

function deliveryId(campaignId: string, contactId: string): string {
  const digest = createHash('sha256').update(`${emailAudience()}\0${campaignId}\0${contactId}`).digest('hex');
  return `campaign:${digest}`;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 900);
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

const defaultDependencies: CampaignDependencies = {
  async findContacts(input) {
    const contacts = await prisma.emailContact.findMany({
      where: {
        audience: input.audience,
        ...(input.language ? { preferredLanguage: input.language } : {}),
        ...(input.all ? {} : { email: { in: input.recipients } }),
      },
      select: {
        id: true,
        email: true,
        marketingSubscribed: true,
        suppressedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (input.all) {
      return contacts.map((contact) => ({ ...contact, allowUnsubscribedMarketingTest: false }));
    }

    const adminUsers = await prisma.user.findMany({
      where: {
        email: { in: input.recipients },
        isAdmin: true,
        isGuest: false,
        deleted: false,
      },
      select: { id: true, email: true, createdAt: true },
    });
    const adminByEmail = new Map(adminUsers.map((user) => [user.email.trim().toLowerCase(), user]));
    const contactEmails = new Set(contacts.map((contact) => contact.email));
    return [
      ...contacts.map((contact) => ({
        ...contact,
        allowUnsubscribedMarketingTest: adminByEmail.has(contact.email),
      })),
      ...adminUsers
        .filter((user) => !contactEmails.has(user.email.trim().toLowerCase()))
        .map((user) => ({
          id: `admin-user:${user.id}`,
          email: user.email.trim().toLowerCase(),
          marketingSubscribed: false,
          suppressedAt: null,
          createdAt: user.createdAt,
          allowUnsubscribedMarketingTest: true,
        })),
    ];
  },
  async findDeliveries(providerEventIds) {
    const deliveries: DeliveryRow[] = [];
    for (let index = 0; index < providerEventIds.length; index += DELIVERY_LOOKUP_BATCH_SIZE) {
      deliveries.push(...await prisma.emailDeliveryEvent.findMany({
        where: { providerEventId: { in: providerEventIds.slice(index, index + DELIVERY_LOOKUP_BATCH_SIZE) } },
        select: { providerEventId: true, eventType: true },
      }));
    }
    return deliveries;
  },
  async claimDelivery(input) {
    if (input.retryFailed) {
      const retried = await prisma.emailDeliveryEvent.updateMany({
        where: { providerEventId: input.providerEventId, eventType: 'CampaignFailed' },
        data: { eventType: 'CampaignSending', details: input.campaignId },
      });
      if (retried.count === 1) return true;
    }
    try {
      await prisma.emailDeliveryEvent.create({
        data: {
          provider: 'postal-campaign',
          providerEventId: input.providerEventId,
          eventType: 'CampaignSending',
          recipient: input.recipient,
          details: input.campaignId,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) return false;
      throw error;
    }
  },
  async finishDelivery(input) {
    await prisma.emailDeliveryEvent.update({
      where: { providerEventId: input.providerEventId },
      data: {
        eventType: input.eventType,
        messageId: input.messageId?.slice(0, 255) || null,
        details: input.details.slice(0, 1024),
      },
    });
  },
  send: ({ allowUnsubscribedMarketingTest, ...input }) => (
    allowUnsubscribedMarketingTest
      ? sendPostalMarketingTestEmail(input)
      : sendPostalEmail(input)
  ),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log: (message) => console.log(message),
};

export async function runPostalMarketingCampaign(
  options: PostalMarketingCampaignOptions,
  dependencyOverrides: Partial<CampaignDependencies> = {},
): Promise<PostalMarketingCampaignResult> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const audience = emailAudience();
  const contacts = await dependencies.findContacts({
    all: options.all,
    recipients: options.recipients,
    audience,
    language: options.language,
  });
  const eligible = contacts.filter((contact) => (
    (contact.marketingSubscribed || contact.allowUnsubscribedMarketingTest) && !contact.suppressedAt
  ));
  const ineligible = options.all
    ? contacts.length - eligible.length
    : options.recipients.length - eligible.length;
  const ids = eligible.map((contact) => deliveryId(options.campaignId, contact.id));
  const existing = await dependencies.findDeliveries(ids);
  const existingById = new Map(existing.map((item) => [item.providerEventId, item.eventType]));
  const selected = eligible.filter((contact) => {
    const eventType = existingById.get(deliveryId(options.campaignId, contact.id));
    return !eventType || (options.retryFailed && eventType === 'CampaignFailed');
  });
  const result: PostalMarketingCampaignResult = {
    audience,
    language: options.language,
    requested: options.all ? 'all' : options.recipients.length,
    eligible: eligible.length,
    ineligible,
    alreadyProcessed: eligible.length - selected.length,
    selected: selected.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    dryRun: options.dryRun,
  };

  dependencies.log(`[campaign] id=${options.campaignId} audience=${audience} language=${options.language ?? 'all'} eligible=${result.eligible} ineligible=${result.ineligible} alreadyProcessed=${result.alreadyProcessed} selected=${result.selected} delayMs=${options.delayMs} dryRun=${options.dryRun}`);
  if (options.dryRun || selected.length === 0) return result;

  for (let index = 0; index < selected.length; index += 1) {
    const contact = selected[index];
    const providerEventId = deliveryId(options.campaignId, contact.id);
    let attempted = false;
    let acceptedByPostal = false;
    try {
      const claimed = await dependencies.claimDelivery({
        providerEventId,
        recipient: contact.email,
        campaignId: options.campaignId,
        retryFailed: options.retryFailed,
      });
      if (!claimed) {
        result.skipped += 1;
        dependencies.log(`[campaign] ${index + 1}/${selected.length} skipped duplicate ${maskEmail(contact.email)}`);
        continue;
      }
      attempted = true;
      const sendResult = await dependencies.send({
        to: contact.email,
        subject: options.subject,
        text: options.text,
        marketing: true,
        allowUnsubscribedMarketingTest: contact.allowUnsubscribedMarketingTest,
        idempotencyKey: providerEventId,
      });
      if (!sendResult.ok) throw new Error(sendResult.error || 'Postal did not accept the message.');
      acceptedByPostal = !sendResult.skipped;
      if (sendResult.skipped) {
        result.skipped += 1;
        await dependencies.finishDelivery({
          providerEventId,
          eventType: 'CampaignSkipped',
          messageId: sendResult.id,
          details: `${options.campaignId}:${sendResult.reason ?? 'skipped'}`,
        });
      } else {
        result.sent += 1;
        await dependencies.finishDelivery({
          providerEventId,
          eventType: 'CampaignSent',
          messageId: sendResult.id,
          details: options.campaignId,
        });
      }
      dependencies.log(`[campaign] ${index + 1}/${selected.length} ${sendResult.skipped ? 'skipped' : 'sent'} ${maskEmail(contact.email)}`);
    } catch (error) {
      result.failed += 1;
      const reason = errorMessage(error);
      if (attempted && !acceptedByPostal) {
        await dependencies.finishDelivery({
          providerEventId,
          eventType: 'CampaignFailed',
          details: `${options.campaignId}:${reason}`,
        });
      }
      const state = acceptedByPostal ? 'accepted by Postal but delivery bookkeeping failed' : 'failed';
      dependencies.log(`[campaign] ${index + 1}/${selected.length} ${state} ${maskEmail(contact.email)}: ${reason}`);
    }
    if (index < selected.length - 1) await dependencies.sleep(options.delayMs);
  }

  dependencies.log(`[campaign] complete id=${options.campaignId} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
  return result;
}
