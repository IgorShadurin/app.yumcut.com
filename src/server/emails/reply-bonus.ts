import { prisma } from '@/server/db';
import { grantTokens, makeSystemInitiator } from '@/server/tokens';
import { TOKEN_COSTS, TOKEN_TRANSACTION_TYPES } from '@/shared/constants/token-costs';
import {
  EMAIL_KIND_REPLY_BONUS_CONFIRMED,
  EMAIL_KIND_WELCOME,
  isResendMarketingReplyAddress,
  normalizeEmail,
  parseReplyBonusReplyToAddress,
  sendLocalizedPlainTextEmail,
} from '@/server/emails/planned';

export type ReplyBonusProcessingResult = {
  eligible: boolean;
  granted: boolean;
  alreadyGranted: boolean;
  userMatched: boolean;
  userId?: string;
  balance?: number;
  confirmationSent?: boolean;
  confirmationError?: string | null;
  reason?:
    | 'no_sender'
    | 'no_signed_recipient'
    | 'user_not_found'
    | 'sender_mismatch'
    | 'already_granted'
    | 'granted';
};

export async function processInboundReplyBonus(input: {
  from: string;
  to: string[];
  emailId: string;
}) : Promise<ReplyBonusProcessingResult> {
  const senderEmail = normalizeEmail(input.from);
  if (!senderEmail) {
    return {
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: false,
      reason: 'no_sender',
    };
  }

  const recipientMatch = parseReplyBonusReplyToAddress(input.to);
  const matchesResendMarketingReply = isResendMarketingReplyAddress(input.to);
  if (!recipientMatch && !matchesResendMarketingReply) {
    return {
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: false,
      reason: 'no_signed_recipient',
    };
  }

  const user = await prisma.user.findUnique({
    where: recipientMatch ? { id: recipientMatch.userId } : { email: senderEmail },
    select: {
      id: true,
      email: true,
      name: true,
      preferredLanguage: true,
      deleted: true,
      emailReplyBonusGrantedAt: true,
      ...(!recipientMatch && matchesResendMarketingReply
        ? {
            plannedEmails: {
              where: { kind: EMAIL_KIND_WELCOME, status: 'sent' },
              select: { id: true },
              take: 1,
            },
          }
        : {}),
    },
  });

  if (!user || user.deleted) {
    return {
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: false,
      ...(recipientMatch ? { userId: recipientMatch.userId } : {}),
      reason: 'user_not_found',
    };
  }

  if (!recipientMatch && !('plannedEmails' in user && user.plannedEmails.length > 0)) {
    return {
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: true,
      userId: user.id,
      reason: 'no_signed_recipient',
    };
  }

  if (normalizeEmail(user.email) !== senderEmail) {
    return {
      eligible: false,
      granted: false,
      alreadyGranted: false,
      userMatched: false,
      userId: user.id,
      reason: 'sender_mismatch',
    };
  }

  if (user.emailReplyBonusGrantedAt) {
    return {
      eligible: true,
      granted: false,
      alreadyGranted: true,
      userMatched: true,
      userId: user.id,
      reason: 'already_granted',
    };
  }

  const grantResult = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: user.id,
        deleted: false,
        email: user.email,
        emailReplyBonusGrantedAt: null,
      },
      data: {
        emailReplyBonusGrantedAt: new Date(),
        emailReplyBonusSourceId: input.emailId,
      },
    });

    if (updated.count === 0) {
      return { granted: false, alreadyGranted: true, balance: undefined as number | undefined };
    }

    const balance = await grantTokens({
      userId: user.id,
      amount: TOKEN_COSTS.emailReplyBonus,
      type: TOKEN_TRANSACTION_TYPES.emailReplyBonus,
      description: 'Email reply bonus',
      initiator: makeSystemInitiator('email-reply-bonus'),
      metadata: {
        emailId: input.emailId,
        amount: TOKEN_COSTS.emailReplyBonus,
      },
    }, tx);

    return { granted: true, alreadyGranted: false, balance };
  });

  if (!grantResult.granted) {
    return {
      eligible: true,
      granted: false,
      alreadyGranted: true,
      userMatched: true,
      userId: user.id,
      reason: 'already_granted',
    };
  }

  const confirmation = await sendLocalizedPlainTextEmail({
    to: user.email,
    kind: EMAIL_KIND_REPLY_BONUS_CONFIRMED,
    languageHint: user.preferredLanguage,
    name: user.name,
  });

  return {
    eligible: true,
    granted: true,
    alreadyGranted: false,
    userMatched: true,
    userId: user.id,
    balance: grantResult.balance,
    confirmationSent: confirmation.ok,
    confirmationError: confirmation.ok ? null : (confirmation.error ?? 'Unknown confirmation email error'),
    reason: 'granted',
  };
}
