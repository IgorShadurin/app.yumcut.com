import crypto from 'crypto';
import { prisma } from './db';
import { config } from './config';
import { normalizeMediaUrl } from './storage';
import { shouldNotifyAdmins } from './admin/notifications';
import { ProjectStatus } from '@/shared/constants/status';

type Maybe<T> = T | null | undefined;

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const RELEVANT_STATUSES = new Set<ProjectStatus>([
  ProjectStatus.ProcessScriptValidate,
  ProjectStatus.ProcessAudioValidate,
  ProjectStatus.Error,
  ProjectStatus.Done,
]);

export function isTelegramEnabled() {
  return Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME);
}

export function getTelegramUpdatesMode(): 'webhook' | 'polling' {
  return (config.TELEGRAM_UPDATES_MODE ?? 'webhook') as 'webhook' | 'polling';
}

function ensureTelegramConfigured() {
  if (!isTelegramEnabled()) {
    throw new Error('Telegram integration is not configured');
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildDeepLink(code: string) {
  if (!config.TELEGRAM_BOT_USERNAME) return null;
  return `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

type ReplyMarkup = {
  inline_keyboard: { text: string; url: string }[][];
};

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: { disableNotification?: boolean; parseMode?: 'HTML' | 'MarkdownV2'; disableWebPagePreview?: boolean; replyMarkup?: ReplyMarkup } = {},
) {
  if (!config.TELEGRAM_BOT_TOKEN) return false;
  try {
    const payload = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options.disableWebPagePreview ?? false,
      disable_notification: options.disableNotification ?? false,
      parse_mode: options.parseMode,
      reply_markup: options.replyMarkup,
    };
    const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Failed to send Telegram message', { status: res.status, body });
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to send Telegram message', err);
    return false;
  }
}

export async function getTelegramAccount(userId: string) {
  return prisma.telegramAccount.findUnique({ where: { userId } });
}

export async function createTelegramLinkToken(userId: string) {
  ensureTelegramConfigured();
  const code = crypto.randomBytes(16).toString('hex');
  const tokenHash = hashToken(code);
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.telegramLinkToken.deleteMany({ where: { userId } }),
    prisma.telegramLinkToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    }),
  ]);
  const deepLink = buildDeepLink(code);
  return {
    code,
    deepLink,
    expiresAt,
  };
}

export async function disconnectTelegramForUser(userId: string) {
  const account = await prisma.telegramAccount.findUnique({ where: { userId } });
  if (!account) return false;
  await prisma.$transaction([
    prisma.telegramAccount.delete({ where: { userId } }),
    prisma.telegramLinkToken.deleteMany({ where: { userId } }),
  ]);
  await sendTelegramMessage(account.chatId, 'Your YumCut account has been disconnected. You can reconnect from the account settings at any time.', {
    disableNotification: true,
  });
  return true;
}

async function disconnectByChat(chatId: string) {
  const account = await prisma.telegramAccount.findUnique({ where: { chatId } });
  if (!account) return false;
  await prisma.$transaction([
    prisma.telegramAccount.delete({ where: { chatId } }),
    prisma.telegramLinkToken.deleteMany({ where: { userId: account.userId } }),
  ]);
  await sendTelegramMessage(chatId, 'Your YumCut account has been disconnected.');
  return true;
}

function formatTitle(title: string) {
  const trimmed = title.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

function buildProjectUrl(projectId: string): string | null {
  const base = config.NEXTAUTH_URL?.trim();
  if (!base) return null;
  try {
    return new URL(`/project/${projectId}`, base).toString();
  } catch {
    return null;
  }
}

function buildAdminProjectUrl(projectId: string): string | null {
  const base = config.NEXTAUTH_URL?.trim();
  if (!base) return null;
  try {
    return new URL(`/admin/projects/${projectId}`, base).toString();
  } catch {
    return null;
  }
}

function ensureAbsoluteUrl(url: Maybe<string>) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = config.STORAGE_PUBLIC_URL?.trim() || config.NEXTAUTH_URL?.trim();
  if (!base) return null;
  try {
    const prepared = url.startsWith('/') ? url : `/${url}`;
    return new URL(prepared, base).toString();
  } catch {
    return null;
  }
}

type ExtraLink = { emoji: string; label: string; url: string };

function collectExtraLinks(status: ProjectStatus, project: { finalVideoUrl: Maybe<string>; finalVideoPath: Maybe<string>; finalVoiceoverUrl: Maybe<string>; finalVoiceoverPath: Maybe<string>; }): ExtraLink[] {
  if (status === ProjectStatus.Done) {
    const rawVideo = project.finalVideoUrl || normalizeMediaUrl(project.finalVideoPath);
    const absoluteVideo = ensureAbsoluteUrl(rawVideo);
    return absoluteVideo ? [{ emoji: '🎬', label: 'Final video', url: absoluteVideo }] : [];
  }
  if (status === ProjectStatus.ProcessAudioValidate) {
    const rawAudio = project.finalVoiceoverUrl || normalizeMediaUrl(project.finalVoiceoverPath);
    const absoluteAudio = ensureAbsoluteUrl(rawAudio);
    return absoluteAudio ? [{ emoji: '🎧', label: 'Latest audio', url: absoluteAudio }] : [];
  }
  return [];
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function notifyProjectStatusChange(projectId: string, status: ProjectStatus, options: { message?: string | null; extra?: Record<string, unknown> | null } = {}) {
  if (!isTelegramEnabled()) return;
  if (!RELEVANT_STATUSES.has(status)) return;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      finalVideoUrl: true,
      finalVideoPath: true,
      finalVoiceoverUrl: true,
      finalVoiceoverPath: true,
    },
  });
  if (!project) return;
  const account = await prisma.telegramAccount.findUnique({ where: { userId: project.userId } });

  const projectUrl = account ? buildProjectUrl(project.id) : null;
  const adminProjectUrl = buildAdminProjectUrl(project.id);
  const title = formatTitle(project.title || 'Untitled project');

  const statusMessage = typeof options.message === 'string' && options.message.trim().length > 0 ? options.message.trim() : null;
  const extraErrorMessage = options.extra && typeof (options.extra as any).message === 'string'
    ? (() => {
        const raw = (options.extra as any).message as string;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
      })()
    : null;

  const extraLinks = collectExtraLinks(status, project);

  if (account) {
    const escapedTitle = escapeHtml(title);
    const baseLines: string[] = [];
    switch (status) {
      case ProjectStatus.ProcessScriptValidate:
        baseLines.push(`📝 <b>${escapedTitle}</b> is ready for script approval.`);
        break;
      case ProjectStatus.ProcessAudioValidate:
        baseLines.push(`🎧 <b>${escapedTitle}</b> is waiting for audio approval.`);
        break;
      case ProjectStatus.Error:
        baseLines.push(`⚠️ <b>${escapedTitle}</b> encountered an error.`);
        break;
      case ProjectStatus.Done:
        baseLines.push(`🎉 <b>${escapedTitle}</b> is complete.`);
        break;
      default:
        baseLines.push(`ℹ️ <b>${escapedTitle}</b> was updated.`);
    }

    if (statusMessage) {
      baseLines.push(`💬 ${escapeHtml(statusMessage)}`);
    }

    if (status === ProjectStatus.Error && extraErrorMessage) {
      baseLines.push(`🛠️ ${escapeHtml(extraErrorMessage)}`);
    }

    const buttons: ReplyMarkup['inline_keyboard'] = [];
    const canUseInlineButton = (url: string) => /^https?:\/\//i.test(url) && !/^http:\/\//i.test(url);

    if (projectUrl) {
      if (canUseInlineButton(projectUrl)) {
        const escapedUrl = escapeHtml(projectUrl);
        baseLines.push(`🔗 <a href="${escapedUrl}">Open project</a>`);
        buttons.push([{ text: '🔗 Open project', url: projectUrl }]);
      } else {
        baseLines.push(projectUrl);
      }
    }

    for (const link of extraLinks) {
      if (canUseInlineButton(link.url)) {
        const escapedLinkUrl = escapeHtml(link.url);
        baseLines.push(`${link.emoji} <a href="${escapedLinkUrl}">${escapeHtml(link.label)}</a>`);
        buttons.push([{ text: `${link.emoji} ${link.label}`, url: link.url }]);
      } else {
        baseLines.push(`${link.url} ${link.emoji} ${link.label}`);
      }
    }

    const text = baseLines.join('\n\n');
    const replyMarkup = buttons.length > 0 ? { inline_keyboard: buttons } : undefined;
    await sendTelegramMessage(account.chatId, text, { parseMode: 'HTML', replyMarkup, disableWebPagePreview: true });
  }

  if (status === ProjectStatus.Done) {
    const finalVideoLink = extraLinks.find((link) => link.label === 'Final video')?.url ?? null;
    notifyAdminsOfProjectDone({
      projectId: project.id,
      title,
      userId: project.userId,
      userEmail: project.user?.email ?? null,
      userName: project.user?.name ?? null,
      projectUrl: adminProjectUrl,
      finalVideoUrl: finalVideoLink,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to notify admins about completed project', err);
    });
  } else if (status === ProjectStatus.Error) {
    notifyAdminsOfProjectError({
      projectId: project.id,
      title,
      userId: project.userId,
      userEmail: project.user?.email ?? null,
      userName: project.user?.name ?? null,
      projectUrl: adminProjectUrl,
      errorMessage: statusMessage,
      extraMessage: extraErrorMessage,
    }).catch((err) => {
      console.error('Failed to notify admins about project error', err);
    });
  }
}

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

async function handleLinkCommand(token: string, message: TelegramMessage) {
  const tokenHash = hashToken(token);
  const linkRecord = await prisma.telegramLinkToken.findUnique({ where: { tokenHash } });
  if (!linkRecord) {
    await sendTelegramMessage(String(message.chat.id), 'This code is invalid or has expired. Generate a new link from YumCut account settings.');
    return;
  }
  if (linkRecord.expiresAt.getTime() < Date.now()) {
    await prisma.telegramLinkToken.delete({ where: { tokenHash } }).catch(() => {});
    await sendTelegramMessage(String(message.chat.id), 'This code has expired. Generate a new link from YumCut account settings.');
    return;
  }
  if (message.chat.type !== 'private') {
    await sendTelegramMessage(String(message.chat.id), 'Please message me directly to link your YumCut account.');
    return;
  }
  const telegramId = message.from?.id ?? message.chat.id;
  const username = message.from?.username ?? message.chat.username ?? null;
  const firstName = message.from?.first_name ?? message.chat.first_name ?? null;
  const lastName = message.from?.last_name ?? message.chat.last_name ?? null;
  const chatId = String(message.chat.id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.telegramLinkToken.deleteMany({ where: { userId: linkRecord.userId } });
    await tx.telegramAccount.upsert({
      where: { userId: linkRecord.userId },
      create: {
        userId: linkRecord.userId,
        telegramId: String(telegramId),
        chatId,
        username,
        firstName,
        lastName,
        linkedAt: now,
      },
      update: {
        telegramId: String(telegramId),
        chatId,
        username,
        firstName,
        lastName,
        linkedAt: now,
      },
    });
  });
  await sendTelegramMessage(chatId, '✅ Your YumCut account is now connected. We will send notifications about your projects here.');
}

async function handleDisconnectCommand(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const disconnected = await disconnectByChat(chatId);
  if (!disconnected) {
    await sendTelegramMessage(chatId, 'No YumCut account is linked to this chat.');
  }
}

async function promptDisconnectConfirmation(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  await sendTelegramMessage(
    chatId,
    '⚠️ Reply with the single word <b>disconnect</b> to unlink your YumCut account. (This helps prevent accidental disconnects.)',
    { parseMode: 'HTML', disableNotification: true },
  );
}

type AdminNotificationKind =
  | 'new_user'
  | 'guest_converted'
  | 'new_project'
  | 'project_done'
  | 'project_error'
  | 'new_group'
  | 'subscription_purchase'
  | 'subscription_cancelled'
  | 'account_deleted';

type AdminNotificationPayloads = {
  new_user: {
    userId: string;
    email: string | null | undefined;
    name: string | null | undefined;
    isGuest?: boolean;
    utmSource?: string | null;
  };
  guest_converted: {
    guestUserId: string;
    finalUserId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    provider: 'apple' | 'google';
    mergedIntoExisting: boolean;
  };
  new_project: {
    projectId: string;
    title: string;
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    projectUrl: string | null | undefined;
  };
  project_done: {
    projectId: string;
    title: string;
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    projectUrl: string | null | undefined;
    finalVideoUrl: string | null | undefined;
  };
  project_error: {
    projectId: string;
    title: string;
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    projectUrl: string | null | undefined;
    errorMessage: string | null | undefined;
    extraMessage: string | null | undefined;
  };
  new_group: {
    groupId: string;
    title: string;
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    groupUrl: string | null | undefined;
  };
  subscription_purchase: {
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    productId: string;
    productLabel: string;
    tokensGranted: number;
    transactionId: string;
    originalTransactionId: string | null | undefined;
    environment: string;
    balance: number;
    source: 'user_purchase' | 'guest_purchase' | 'auto_renew';
  };
  subscription_cancelled: {
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    productId: string;
    productLabel: string;
    transactionId: string | null | undefined;
    originalTransactionId: string | null | undefined;
    environment: string | null | undefined;
    reason: string | null | undefined;
    autoRenewStatus: number | null | undefined;
  };
  account_deleted: {
    userId: string;
    userEmail: string | null | undefined;
    userName: string | null | undefined;
    source: string;
    reason: string | null | undefined;
  };
};

async function notifyAdminsInternal<K extends AdminNotificationKind>(kind: K, payload: AdminNotificationPayloads[K]) {
  if (!isTelegramEnabled()) return;
  if (!(await shouldNotifyAdmins(kind))) return;
  const recipients = await prisma.telegramAccount.findMany({
    where: { user: { isAdmin: true } },
    select: { chatId: true },
  });
  if (recipients.length === 0) return;

  const lines: string[] = [];
  const ownerName = (payload as any).userName?.trim() || null;
  const ownerEmail = (payload as any).userEmail?.trim() || null;
  const ownerLabel = ownerName && ownerEmail ? `${ownerName} (${ownerEmail})` : ownerName || ownerEmail || 'Unknown user';

  switch (kind) {
    case 'new_user': {
      const newUser = payload as AdminNotificationPayloads['new_user'];
      const userTypeLabel = newUser.isGuest ? 'Guest session issued' : 'New user joined YumCut';
      lines.push(`👤 ${userTypeLabel}`);
      lines.push(`Name: ${newUser.name?.trim() || '—'}`);
      lines.push(`Email: ${newUser.email || '—'}`);
      if (newUser.utmSource?.trim()) {
        lines.push(`Source: ${newUser.utmSource.trim()}`);
      }
      lines.push(`User ID: ${newUser.userId}`);
      if (newUser.isGuest) {
        lines.push('Mode: Guest onboarding');
      }
      break;
    }
    case 'guest_converted': {
      const converted = payload as AdminNotificationPayloads['guest_converted'];
      lines.push('🔁 Guest account upgraded');
      lines.push(`Provider: ${converted.provider === 'apple' ? 'Sign in with Apple' : 'Sign in with Google'}`);
      lines.push(`Guest ID: ${converted.guestUserId}`);
      lines.push(`Final user ID: ${converted.finalUserId}`);
      lines.push(`Owner: ${ownerLabel}`);
      lines.push(`Merged into existing account: ${converted.mergedIntoExisting ? 'Yes' : 'No'}`);
      break;
    }
    case 'new_project': {
      const projectPayload = payload as AdminNotificationPayloads['new_project'];
      lines.push('🆕 Project created');
      lines.push(`Title: ${projectPayload.title}`);
      lines.push(`Owner: ${ownerLabel}`);
      if (projectPayload.projectUrl) {
        lines.push(`Project: ${projectPayload.projectUrl}`);
      }
      lines.push(`Project ID: ${projectPayload.projectId}`);
      break;
    }
    case 'project_done': {
      const donePayload = payload as AdminNotificationPayloads['project_done'];
      lines.push('✅ Project completed');
      lines.push(`Title: ${donePayload.title}`);
      lines.push(`Owner: ${ownerLabel}`);
      if (donePayload.projectUrl) {
        lines.push(`Project: ${donePayload.projectUrl}`);
      }
      if (donePayload.finalVideoUrl) {
        lines.push(`Final video: ${donePayload.finalVideoUrl}`);
      }
      lines.push(`Project ID: ${donePayload.projectId}`);
      break;
    }
    case 'new_group': {
      const groupPayload = payload as AdminNotificationPayloads['new_group'];
      lines.push('🆕 Group created');
      lines.push(`Title: ${groupPayload.title}`);
      lines.push(`Owner: ${ownerLabel}`);
      if (groupPayload.groupUrl) {
        lines.push(`Admin: ${groupPayload.groupUrl}`);
      }
      lines.push(`Group ID: ${groupPayload.groupId}`);
      break;
    }
    case 'project_error': {
      const errorPayload = payload as AdminNotificationPayloads['project_error'];
      lines.push('⚠️ Project failed');
      lines.push(`Title: ${errorPayload.title}`);
      lines.push(`Owner: ${ownerLabel}`);
      if (errorPayload.errorMessage) {
        lines.push(`Error: ${errorPayload.errorMessage}`);
      }
      if (errorPayload.extraMessage && errorPayload.extraMessage !== errorPayload.errorMessage) {
        lines.push(`Details: ${errorPayload.extraMessage}`);
      }
      if (errorPayload.projectUrl) {
        lines.push(`Project: ${errorPayload.projectUrl}`);
      }
      lines.push(`Project ID: ${errorPayload.projectId}`);
      break;
    }
    case 'subscription_purchase': {
      const purchasePayload = payload as AdminNotificationPayloads['subscription_purchase'];
      const isAutoRenew = purchasePayload.source === 'auto_renew';
      const isGuestPurchase = purchasePayload.source === 'guest_purchase';
      const sourceLabel = isAutoRenew ? 'Auto-renewal' : isGuestPurchase ? 'Guest purchase' : 'New purchase';
      const environmentLabel =
        purchasePayload.environment && purchasePayload.environment.toLowerCase() === 'sandbox'
          ? ' [SANDBOX]'
          : '';
      lines.push(
        (isAutoRenew ? '🔄' : '💳') + `${environmentLabel} ${isAutoRenew ? 'Subscription renewal' : 'Subscription purchase'}`,
      );
      lines.push(`Type: ${sourceLabel}`);
      lines.push(`Plan: ${purchasePayload.productLabel} (${purchasePayload.productId})`);
      lines.push(`Tokens granted: ${purchasePayload.tokensGranted}`);
      lines.push(`Owner: ${ownerLabel}`);
      lines.push(`User ID: ${purchasePayload.userId}`);
      lines.push(`Transaction: ${purchasePayload.transactionId}`);
      if (
        purchasePayload.originalTransactionId &&
        purchasePayload.originalTransactionId !== purchasePayload.transactionId
      ) {
        lines.push(`Original TX: ${purchasePayload.originalTransactionId}`);
      }
      lines.push(`Environment: ${purchasePayload.environment}`);
      lines.push(`New balance: ${purchasePayload.balance}`);
      break;
    }
    case 'subscription_cancelled': {
      const cancelPayload = payload as AdminNotificationPayloads['subscription_cancelled'];
      const environmentLabel =
        cancelPayload.environment && cancelPayload.environment.toLowerCase() === 'sandbox'
          ? ' [SANDBOX]'
          : '';
      lines.push(`🏁${environmentLabel} Subscription cancelled`);
      lines.push(`Plan: ${cancelPayload.productLabel} (${cancelPayload.productId})`);
      lines.push(`Owner: ${ownerLabel}`);
      if (cancelPayload.reason) {
        lines.push(`Reason: ${cancelPayload.reason}`);
      }
      if (typeof cancelPayload.autoRenewStatus === 'number') {
        lines.push(`Auto-renew status: ${cancelPayload.autoRenewStatus}`);
      }
      if (cancelPayload.environment) {
        lines.push(`Environment: ${cancelPayload.environment}`);
      }
      if (cancelPayload.originalTransactionId) {
        lines.push(`Original TX: ${cancelPayload.originalTransactionId}`);
      }
      if (cancelPayload.transactionId) {
        lines.push(`Last transaction: ${cancelPayload.transactionId}`);
      }
      lines.push(`User ID: ${cancelPayload.userId}`);
      break;
    }
    case 'account_deleted': {
      const accountPayload = payload as AdminNotificationPayloads['account_deleted'];
      lines.push('🗑️ Account deleted');
      lines.push(`Owner: ${ownerLabel}`);
      lines.push(`User ID: ${accountPayload.userId}`);
      lines.push(`Source: ${accountPayload.source}`);
      lines.push(`Reason: ${accountPayload.reason?.trim() || '—'}`);
      break;
    }
    default:
      return;
  }

  const message = lines.join('\n');
  await Promise.allSettled(
    recipients.map(({ chatId }) =>
      sendTelegramMessage(chatId, message, { disableWebPagePreview: true }).catch((err) => {
        console.error('Failed to notify admin via Telegram', { kind, chatId, err });
        return false;
      }),
    ),
  );
}

export function notifyAdminsOfNewUser(payload: AdminNotificationPayloads['new_user']) {
  return notifyAdminsInternal('new_user', payload);
}

export function notifyAdminsOfGuestConversion(payload: AdminNotificationPayloads['guest_converted']) {
  return notifyAdminsInternal('guest_converted', payload);
}

export function notifyAdminsOfNewProject(payload: AdminNotificationPayloads['new_project']) {
  return notifyAdminsInternal('new_project', payload);
}

export function notifyAdminsOfNewGroup(payload: AdminNotificationPayloads['new_group']) {
  return notifyAdminsInternal('new_group', payload);
}

export function notifyAdminsOfProjectDone(payload: AdminNotificationPayloads['project_done']) {
  return notifyAdminsInternal('project_done', payload);
}

export function notifyAdminsOfProjectError(payload: AdminNotificationPayloads['project_error']) {
  return notifyAdminsInternal('project_error', payload);
}

export function notifyAdminsOfSubscriptionPurchase(payload: AdminNotificationPayloads['subscription_purchase']) {
  return notifyAdminsInternal('subscription_purchase', payload);
}

export function notifyAdminsOfSubscriptionCancellation(payload: AdminNotificationPayloads['subscription_cancelled']) {
  return notifyAdminsInternal('subscription_cancelled', payload);
}

export function notifyAdminsOfAccountDeletion(payload: AdminNotificationPayloads['account_deleted']) {
  return notifyAdminsInternal('account_deleted', payload);
}

async function handleUnsupportedCommand(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  await sendTelegramMessage(
    chatId,
    'ℹ️ That command is not supported. Use the code from your YumCut account to connect, or send /stop to disconnect.',
    { parseMode: 'HTML', disableNotification: true },
  );
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  if (!isTelegramEnabled()) return;
  const message = update.message;
  if (!message) return;
  const text = (message.text || '').trim();
  if (!text) return;
  const normalized = text.toLowerCase();

  if (text.startsWith('/start')) {
    const [, token] = text.split(/\s+/, 2);
    if (token) {
      await handleLinkCommand(token, message);
    } else {
      await sendTelegramMessage(String(message.chat.id), 'Send the connection code shown in YumCut to link your account.');
    }
    return;
  }
  if (normalized === '/stop' || normalized === '/disconnect') {
    await promptDisconnectConfirmation(message);
    return;
  }
  if (normalized === 'disconnect') {
    await handleDisconnectCommand(message);
    return;
  }
  await handleUnsupportedCommand(message);
}
