import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { ok } from '@/server/http';
import { withApiError } from '@/server/errors';
import { notifyAdminsOfAppStoreServerEvent } from '@/server/telegram/app-store-notifications';
import {
  decodeAppStoreSignedPayload,
  extractNotificationUuid,
} from '@/server/app-store/notification-utils';
import { processAppStoreServerNotification } from '@/server/app-store/notification-processor';
import { logAppleSubscriptionEvent } from '@/server/app-store/subscription-logger';
import { config } from '@/server/config';

export const POST = withApiError(async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const headersObject = Object.fromEntries(req.headers.entries());
  const bodyRecord =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const signedPayload =
    typeof bodyRecord?.signedPayload === 'string' ? (bodyRecord.signedPayload as string) : null;
  const decoded = decodeAppStoreSignedPayload(signedPayload);
  const notificationUuid = extractNotificationUuid(decoded, bodyRecord);

  logAppleSubscriptionEvent('app_store_notification_received', {
    notificationUuid,
    notificationType: decoded?.notificationType || (bodyRecord?.notificationType ? String(bodyRecord.notificationType) : undefined),
    subtype: decoded?.subtype || (bodyRecord?.subtype ? String(bodyRecord.subtype) : undefined),
    environment: decoded?.data?.environment || (bodyRecord?.environment ? String(bodyRecord.environment) : undefined),
    hasSignedPayload: Boolean(signedPayload),
    status: typeof decoded?.data?.status === 'number' ? decoded?.data?.status : undefined,
    originalTransactionId: typeof decoded?.data?.originalTransactionId === 'string' ? decoded?.data?.originalTransactionId : undefined,
  });

  const payloadRecord: Record<string, unknown> = {};
  if (body !== null) {
    payloadRecord.rawBody = body;
  }
  if (decoded) {
    payloadRecord.decodedPayload = decoded;
  }

  const payloadValue: Prisma.InputJsonValue | undefined = Object.keys(payloadRecord).length
    ? (payloadRecord as Prisma.InputJsonValue)
    : undefined;
  const headersValue: Prisma.InputJsonValue | undefined = Object.keys(headersObject).length
    ? (headersObject as Prisma.InputJsonValue)
    : undefined;

  if (notificationUuid) {
    const existing = await prisma.appStoreServerNotification.findUnique({
      where: { notificationUuid },
    });
    if (existing) {
      return ok({ success: true, duplicate: true, notificationUuid });
    }
  }

  const record = await prisma.appStoreServerNotification.create({
    data: {
      notificationType:
        decoded?.notificationType ||
        (bodyRecord?.notificationType ? String(bodyRecord.notificationType) : null),
      subtype:
        decoded?.subtype || (bodyRecord?.subtype ? String(bodyRecord.subtype) : null),
      environment:
        decoded?.data?.environment ||
        (bodyRecord?.environment ? String(bodyRecord.environment) : null),
      notificationUuid,
      signedPayload,
      payload: payloadValue,
      headers: headersValue,
    },
  });

  logAppleSubscriptionEvent('app_store_notification_stored', {
    notificationId: record.id,
    notificationUuid: record.notificationUuid,
    notificationType: record.notificationType,
    subtype: record.subtype,
    environment: record.environment,
  });

  processAppStoreServerNotification(record).catch((err) => {
    console.error('Failed to process App Store server notification', err);
  });

  if (config.APPLE_SERVER_NOTIFICATION_TELEGRAM_ENABLED) {
    notifyAdminsOfAppStoreServerEvent(record).catch((err) => {
      console.error('Failed to broadcast App Store server notification to Telegram', err);
    });
  }

  return ok({ success: true });
}, 'Failed to store App Store notification');
