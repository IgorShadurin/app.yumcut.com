import type { AppStoreServerNotification } from '@prisma/client';
import { prisma } from '@/server/db';
import { processIosSubscriptionPurchase } from '@/server/subscriptions';
import { decodeAppStoreSignedPayload } from './notification-utils';
import { logAppleSubscriptionEvent } from './subscription-logger';
import { decodeSignedTransactionPayload } from './signed-data-verifier';
import { getSubscriptionConfig } from '@/shared/constants/subscriptions';
import { notifyAdminsOfSubscriptionCancellation } from '@/server/telegram';

const TOKEN_ELIGIBLE_TYPES = new Set(['DID_RENEW', 'DID_RECOVER', 'INTERACTIVE_RENEWAL']);

export async function processAppStoreServerNotification(record: AppStoreServerNotification) {
  if (!record.signedPayload) {
    logAppleSubscriptionEvent('app_store_notification_skipped', {
      notificationId: record.id,
      reason: 'missing_signed_payload',
    });
    return;
  }
  const type = (record.notificationType || '').toUpperCase();
  const decoded = decodeAppStoreSignedPayload(record.signedPayload);
  const data = decoded?.data;
  if (!data) {
    logAppleSubscriptionEvent('app_store_notification_skipped', {
      notificationId: record.id,
      reason: 'missing_data_block',
    });
    return;
  }

  const signedTransactionInfo =
    typeof data.signedTransactionInfo === 'string' ? data.signedTransactionInfo : null;
  if (!signedTransactionInfo) {
    return;
  }

  let decodedTransaction;
  try {
    decodedTransaction = await decodeSignedTransactionPayload(signedTransactionInfo);
  } catch (error) {
    logAppleSubscriptionEvent('app_store_notification_skipped', {
      notificationId: record.id,
      reason: 'transaction_decode_failed',
      message: error instanceof Error ? error.message : String(error),
    });
    console.error('Failed to decode signedTransactionInfo from App Store notification', error);
    return;
  }

  const normalizedOriginalTransactionId =
    (typeof data.originalTransactionId === 'string' && data.originalTransactionId.trim().length > 0
      ? data.originalTransactionId
      : null) ||
    decodedTransaction.originalTransactionId ||
    decodedTransaction.transactionId ||
    null;

  let userId: string | null = null;
  const appAccountToken =
    typeof decodedTransaction.appAccountToken === 'string' ? decodedTransaction.appAccountToken : null;
  let cachedUserProfile:
    | {
        id: string;
        email: string | null;
        name: string | null;
      }
    | null = null;

  if (appAccountToken) {
    const user = await prisma.user.findUnique({
      where: { id: appAccountToken },
      select: { id: true, email: true, name: true },
    });
    if (user) {
      userId = user.id;
      cachedUserProfile = user;
    }
  }

  if (!userId && normalizedOriginalTransactionId) {
    const owner = await prisma.subscriptionPurchase.findFirst({
      where: { originalTransactionId: normalizedOriginalTransactionId },
      select: { userId: true },
    });
    if (owner?.userId) {
      userId = owner.userId;
    }
  }

  if (!userId) {
    logAppleSubscriptionEvent('app_store_notification_skipped', {
      notificationId: record.id,
      originalTransactionId: normalizedOriginalTransactionId,
      reason: 'owner_not_found',
      hasAppAccountToken: Boolean(appAccountToken),
    });
    return;
  }

  if (!cachedUserProfile) {
    cachedUserProfile = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
  }

  if (type === 'EXPIRED') {
    const productId =
      decodedTransaction.productId ||
      (typeof data.productId === 'string' ? data.productId : null) ||
      record.notificationType ||
      'unknown';
    const productConfig = getSubscriptionConfig(productId) || null;
    const reason =
      record.subtype ||
      decoded?.subtype ||
      (typeof (data as Record<string, unknown>)?.subtype === 'string'
        ? ((data as Record<string, unknown>).subtype as string)
        : null);
    const autoRenewStatus =
      typeof (data as Record<string, unknown>)?.autoRenewStatus === 'number'
        ? ((data as Record<string, unknown>).autoRenewStatus as number)
        : typeof (decodedTransaction as Record<string, unknown>).autoRenewStatus === 'number'
          ? ((decodedTransaction as Record<string, unknown>).autoRenewStatus as number)
          : null;

    await notifyAdminsOfSubscriptionCancellation({
      userId,
      userEmail: cachedUserProfile?.email ?? null,
      userName: cachedUserProfile?.name ?? null,
      productId,
      productLabel: productConfig?.label ?? productId,
      transactionId: decodedTransaction.transactionId ?? null,
      originalTransactionId: normalizedOriginalTransactionId,
      environment: record.environment ?? data?.environment ?? 'Production',
      reason,
      autoRenewStatus,
    });

    logAppleSubscriptionEvent('app_store_notification_cancelled', {
      notificationId: record.id,
      userId,
      productId,
      reason,
      autoRenewStatus,
    });
    return;
  }

  if (!TOKEN_ELIGIBLE_TYPES.has(type)) {
    logAppleSubscriptionEvent('app_store_notification_skipped', {
      notificationId: record.id,
      notificationType: record.notificationType,
      reason: 'type_not_eligible',
    });
    return;
  }

  const status = typeof data.status === 'number' ? data.status : undefined;
  if (status !== undefined && status !== 1) {
    logAppleSubscriptionEvent('app_store_notification_skipped', {
      notificationId: record.id,
      notificationType: record.notificationType,
      status,
      reason: 'status_not_success',
    });
    return;
  }

  try {
    const outcome = await processIosSubscriptionPurchase({
      userId,
      signedTransactions: [signedTransactionInfo],
      source: 'auto_renew',
    });
    logAppleSubscriptionEvent('app_store_notification_processed', {
      notificationId: record.id,
      userId,
      productId: outcome.productId,
      transactionId: outcome.transactionId,
      status: outcome.alreadyProcessed ? 'already_processed' : 'credited',
      tokensGranted: outcome.tokensGranted,
      balance: outcome.balance,
      expiresAt: outcome.expiresAt,
    });
  } catch (error) {
    logAppleSubscriptionEvent('app_store_notification_error', {
      notificationId: record.id,
      originalTransactionId: normalizedOriginalTransactionId,
      message: error instanceof Error ? error.message : String(error),
    });
    console.error('Failed to auto-credit tokens from App Store notification', {
      notificationId: record.id,
      originalTransactionId: normalizedOriginalTransactionId,
      error,
    });
  }
}
