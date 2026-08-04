import { prisma } from '@/server/db';
import { config } from '@/server/config';
import { normalizeMediaUrl } from '@/server/storage';
import {
  EMAIL_KIND_IMAGE_PROJECT_CREATED,
  EMAIL_KIND_IMAGE_PROJECT_READY,
  EMAIL_KIND_PROJECT_CREATED,
  EMAIL_KIND_PROJECT_FAILED,
  EMAIL_KIND_PROJECT_READY,
  normalizeEmail,
  sendLocalizedPlainTextEmail,
} from '@/server/emails/planned';

type EmailResult = {
  sent: boolean;
  skipped: boolean;
  reason?: string;
  error?: string | null;
};

type BaseProjectEmailInput = {
  userId: string;
  email?: string | null;
  name?: string | null;
  preferredLanguage?: string | null;
  projectId: string;
  projectTitle?: string | null;
  projectEmailsEnabled?: boolean | null;
};

type ProjectReadyEmailInput = BaseProjectEmailInput & {
  finalVideoUrl?: string | null;
};

type ProjectFailedEmailInput = BaseProjectEmailInput & {
  refundedTokens: number;
};

const DEFAULT_APP_ORIGIN = 'https://app.yumcut.com';

export function buildProjectUrl(projectId: string): string {
  const configured = config.NEXTAUTH_URL?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_APP_ORIGIN;
  try {
    return new URL(`/project/${projectId}`, base).toString();
  } catch {
    return `${DEFAULT_APP_ORIGIN}/project/${projectId}`;
  }
}

async function resolveProjectEmailsEnabled(input: { userId: string; projectEmailsEnabled?: boolean | null }): Promise<boolean> {
  if (typeof input.projectEmailsEnabled === 'boolean') return input.projectEmailsEnabled;
  const settings = await prisma.userSettings.findUnique({
    where: { userId: input.userId },
    select: { projectEmailsEnabled: true },
  });
  return settings?.projectEmailsEnabled ?? true;
}

export async function sendProjectCreatedEmail(input: BaseProjectEmailInput): Promise<EmailResult> {
  const to = normalizeEmail(input.email);
  if (!to) {
    return { sent: false, skipped: true, reason: 'invalid-email' };
  }

  const enabled = await resolveProjectEmailsEnabled(input);
  if (!enabled) {
    return { sent: false, skipped: true, reason: 'disabled-by-user' };
  }

  const projectUrl = buildProjectUrl(input.projectId);
  const result = await sendLocalizedPlainTextEmail({
    to,
    kind: EMAIL_KIND_PROJECT_CREATED,
    languageHint: input.preferredLanguage,
    name: input.name,
    variables: {
      project_title: (input.projectTitle || '').trim(),
      project_url: projectUrl,
      ready_eta: '30+ minutes',
      ready_eta_ru: '30+ минут',
    },
  });

  return {
    sent: result.ok,
    skipped: false,
    error: result.ok ? null : (result.error ?? 'Unknown email send error'),
  };
}

export async function sendImageProjectCreatedEmail(input: BaseProjectEmailInput): Promise<EmailResult> {
  const to = normalizeEmail(input.email);
  if (!to) {
    return { sent: false, skipped: true, reason: 'invalid-email' };
  }

  const enabled = await resolveProjectEmailsEnabled(input);
  if (!enabled) {
    return { sent: false, skipped: true, reason: 'disabled-by-user' };
  }

  const result = await sendLocalizedPlainTextEmail({
    to,
    kind: EMAIL_KIND_IMAGE_PROJECT_CREATED,
    languageHint: input.preferredLanguage,
    name: input.name,
    variables: {
      project_title: (input.projectTitle || '').trim(),
      project_url: buildProjectUrl(input.projectId),
    },
  });

  return {
    sent: result.ok,
    skipped: false,
    error: result.ok ? null : (result.error ?? 'Unknown email send error'),
  };
}

function resolveFinalVideoUrl(value: string | null | undefined): string {
  if (!value) return '';
  return normalizeMediaUrl(value) ?? value;
}

export async function sendProjectReadyEmail(input: ProjectReadyEmailInput): Promise<EmailResult> {
  const to = normalizeEmail(input.email);
  if (!to) {
    return { sent: false, skipped: true, reason: 'invalid-email' };
  }

  const enabled = await resolveProjectEmailsEnabled(input);
  if (!enabled) {
    return { sent: false, skipped: true, reason: 'disabled-by-user' };
  }

  const projectUrl = buildProjectUrl(input.projectId);
  const finalVideoUrl = resolveFinalVideoUrl(input.finalVideoUrl);
  const result = await sendLocalizedPlainTextEmail({
    to,
    kind: EMAIL_KIND_PROJECT_READY,
    languageHint: input.preferredLanguage,
    name: input.name,
    variables: {
      project_title: (input.projectTitle || '').trim(),
      project_url: projectUrl,
      final_video_url: finalVideoUrl,
    },
  });

  return {
    sent: result.ok,
    skipped: false,
    error: result.ok ? null : (result.error ?? 'Unknown email send error'),
  };
}

export async function sendImageProjectReadyEmail(input: BaseProjectEmailInput): Promise<EmailResult> {
  const to = normalizeEmail(input.email);
  if (!to) {
    return { sent: false, skipped: true, reason: 'invalid-email' };
  }

  const enabled = await resolveProjectEmailsEnabled(input);
  if (!enabled) {
    return { sent: false, skipped: true, reason: 'disabled-by-user' };
  }

  const result = await sendLocalizedPlainTextEmail({
    to,
    kind: EMAIL_KIND_IMAGE_PROJECT_READY,
    languageHint: input.preferredLanguage,
    name: input.name,
    variables: {
      project_title: (input.projectTitle || '').trim(),
      project_url: buildProjectUrl(input.projectId),
    },
  });

  return {
    sent: result.ok,
    skipped: false,
    error: result.ok ? null : (result.error ?? 'Unknown email send error'),
  };
}

function formatTokenAmount(value: number, languageHint?: string | null): string {
  const normalized = typeof languageHint === 'string' ? languageHint.trim().toLowerCase() : '';
  const locale = normalized.startsWith('ru') ? 'ru-RU' : 'en-US';
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)).toLocaleString(locale);
}

export async function sendProjectFailedEmail(input: ProjectFailedEmailInput): Promise<EmailResult> {
  const to = normalizeEmail(input.email);
  if (!to) {
    return { sent: false, skipped: true, reason: 'invalid-email' };
  }

  const enabled = await resolveProjectEmailsEnabled(input);
  if (!enabled) {
    return { sent: false, skipped: true, reason: 'disabled-by-user' };
  }

  const projectUrl = buildProjectUrl(input.projectId);
  const result = await sendLocalizedPlainTextEmail({
    to,
    kind: EMAIL_KIND_PROJECT_FAILED,
    languageHint: input.preferredLanguage,
    name: input.name,
    variables: {
      project_title: (input.projectTitle || '').trim(),
      project_url: projectUrl,
      refunded_tokens: formatTokenAmount(input.refundedTokens, input.preferredLanguage),
    },
  });

  return {
    sent: result.ok,
    skipped: false,
    error: result.ok ? null : (result.error ?? 'Unknown email send error'),
  };
}
