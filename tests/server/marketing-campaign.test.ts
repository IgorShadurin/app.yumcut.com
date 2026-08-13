import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({
  prisma: {
    emailContact: { findMany: vi.fn() },
    emailDeliveryEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/server/emails/contacts', () => ({
  emailAudience: () => 'yumcut',
  normalizeEmailContactAddress: (value?: string | null) => {
    const email = value?.trim().toLowerCase() ?? '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@guest.yumcut') ? email : null;
  },
}));
vi.mock('@/server/emails/postal', () => ({
  sendPostalEmail: vi.fn(),
  sendPostalMarketingTestEmail: vi.fn(),
}));

const { parsePostalMarketingCampaignArgs, runPostalMarketingCampaign } = await import('@/server/emails/marketing-campaign');

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function options(overrides: Partial<Awaited<ReturnType<typeof parsePostalMarketingCampaignArgs>>> = {}) {
  return {
    all: false,
    recipients: ['first@example.com', 'second@example.com'],
    campaignId: 'august-update',
    subject: 'A product update',
    text: 'Hello from YumCut.',
    delayMs: 2_000,
    dryRun: false,
    retryFailed: false,
    ...overrides,
  };
}

function contact(id: string, email: string, overrides: Partial<{
  marketingSubscribed: boolean;
  suppressedAt: Date | null;
  allowUnsubscribedMarketingTest: boolean;
}> = {}) {
  return {
    id,
    email,
    marketingSubscribed: true,
    suppressedAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    allowUnsubscribedMarketingTest: false,
    ...overrides,
  };
}

describe('Postal marketing campaign arguments', () => {
  it('accepts repeated recipients and defaults to a two-second delay', async () => {
    await expect(parsePostalMarketingCampaignArgs([
      '--to', 'FIRST@example.com',
      '--to=second@example.com',
      '--campaign-id', 'august-update',
      '--subject', 'Product update',
      '--text', 'Hello',
      '--dry-run',
    ])).resolves.toMatchObject({
      all: false,
      recipients: ['first@example.com', 'second@example.com'],
      delayMs: 2_000,
      dryRun: true,
    });
  });

  it('reads campaign text from a file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'yumcut-campaign-'));
    temporaryDirectories.push(directory);
    await writeFile(path.join(directory, 'message.txt'), 'Line one\n\nLine two\n', 'utf8');

    await expect(parsePostalMarketingCampaignArgs([
      '--all',
      '--campaign-id=august-update',
      '--subject=Product update',
      '--text-file=message.txt',
      '--confirm-send',
    ], directory)).resolves.toMatchObject({
      all: true,
      text: 'Line one\n\nLine two',
      dryRun: false,
    });
  });

  it('requires one recipient mode, one body source, and explicit dry-run or send confirmation', async () => {
    await expect(parsePostalMarketingCampaignArgs([
      '--all', '--to', 'user@example.com', '--campaign-id', 'test-run', '--subject', 'Test', '--text', 'Body', '--dry-run',
    ])).rejects.toThrow('exactly one of --all');
    await expect(parsePostalMarketingCampaignArgs([
      '--to', 'user@example.com', '--campaign-id', 'test-run', '--subject', 'Test', '--text', 'Body',
    ])).rejects.toThrow('exactly one of --dry-run or --confirm-send');
    await expect(parsePostalMarketingCampaignArgs([
      '--to', 'user@example.com', '--campaign-id', 'test-run', '--subject', 'Test', '--text', 'Body', '--text-file', 'body.txt', '--dry-run',
    ])).rejects.toThrow('exactly one of --text or --text-file');
  });
});

describe('Postal marketing campaign execution', () => {
  it('dry-runs only subscribed, non-suppressed contacts without sending or claiming', async () => {
    const send = vi.fn();
    const claimDelivery = vi.fn();
    const result = await runPostalMarketingCampaign(options({
      recipients: ['first@example.com', 'second@example.com', 'missing@example.com'],
      dryRun: true,
    }), {
      findContacts: vi.fn(async () => [
        contact('contact-1', 'first@example.com'),
        contact('contact-2', 'second@example.com', { marketingSubscribed: false }),
      ]),
      findDeliveries: vi.fn(async () => []),
      claimDelivery,
      send,
      log: vi.fn(),
    });

    expect(result).toMatchObject({ eligible: 1, ineligible: 2, selected: 1, sent: 0, dryRun: true });
    expect(send).not.toHaveBeenCalled();
    expect(claimDelivery).not.toHaveBeenCalled();
  });

  it('sends through Postal as marketing mail and waits two seconds between recipients', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: true, id: 'postal-1' })
      .mockResolvedValueOnce({ ok: true, id: 'postal-2' });
    const finishDelivery = vi.fn(async () => undefined);
    const sleep = vi.fn(async () => undefined);
    const result = await runPostalMarketingCampaign(options(), {
      findContacts: vi.fn(async () => [
        contact('contact-1', 'first@example.com'),
        contact('contact-2', 'second@example.com'),
      ]),
      findDeliveries: vi.fn(async () => []),
      claimDelivery: vi.fn(async () => true),
      finishDelivery,
      send,
      sleep,
      log: vi.fn(),
    });

    expect(result).toMatchObject({ selected: 2, sent: 2, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      to: 'first@example.com',
      subject: 'A product update',
      text: 'Hello from YumCut.',
      marketing: true,
      allowUnsubscribedMarketingTest: false,
      idempotencyKey: expect.stringMatching(/^campaign:/),
    }));
    expect(finishDelivery).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'CampaignSent', messageId: 'postal-1' }));
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('does not resend a completed campaign to the same contact', async () => {
    const send = vi.fn();
    const result = await runPostalMarketingCampaign(options({ recipients: ['first@example.com'] }), {
      findContacts: vi.fn(async () => [contact('contact-1', 'first@example.com')]),
      findDeliveries: vi.fn(async (ids) => [{ providerEventId: ids[0], eventType: 'CampaignSent' }]),
      send,
      log: vi.fn(),
    });

    expect(result).toMatchObject({ eligible: 1, alreadyProcessed: 1, selected: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('allows a non-suppressed admin address as an explicit campaign test recipient', async () => {
    const send = vi.fn(async () => ({ ok: true, id: 'postal-test' }));
    const result = await runPostalMarketingCampaign(options({ recipients: ['admin@example.com'] }), {
      findContacts: vi.fn(async () => [contact('admin-user:admin-1', 'admin@example.com', {
        marketingSubscribed: false,
        allowUnsubscribedMarketingTest: true,
      })]),
      findDeliveries: vi.fn(async () => []),
      claimDelivery: vi.fn(async () => true),
      finishDelivery: vi.fn(async () => undefined),
      send,
      log: vi.fn(),
    });

    expect(result).toMatchObject({ eligible: 1, ineligible: 0, sent: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@example.com',
      marketing: true,
      allowUnsubscribedMarketingTest: true,
    }));
  });

  it('does not mark a Postal-accepted message retryable when delivery bookkeeping fails', async () => {
    const finishDelivery = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const result = await runPostalMarketingCampaign(options({ recipients: ['first@example.com'] }), {
      findContacts: vi.fn(async () => [contact('contact-1', 'first@example.com')]),
      findDeliveries: vi.fn(async () => []),
      claimDelivery: vi.fn(async () => true),
      finishDelivery,
      send: vi.fn(async () => ({ ok: true, id: 'postal-accepted' })),
      log: vi.fn(),
    });

    expect(result.failed).toBe(1);
    expect(finishDelivery).toHaveBeenCalledOnce();
    expect(finishDelivery).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'CampaignSent' }));
  });
});
