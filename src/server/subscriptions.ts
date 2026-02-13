import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { config } from './config';
import { grantTokens } from './tokens';
import { TOKEN_TRANSACTION_TYPES } from '@/shared/constants/token-costs';
import { getSubscriptionConfig } from '@/shared/constants/subscriptions';
import { decodeSignedTransactionPayload } from './app-store/signed-data-verifier';
import { logAppleSubscriptionEvent } from './app-store/subscription-logger';
import { notifyAdminsOfSubscriptionPurchase } from './telegram';

const APPLE_PRODUCTION_VERIFY_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_VERIFY_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
const SUBSCRIPTION_STATUS_GRACE_MS = 60 * 60 * 1000; // 1 hour fallback when Apple omits expiry.

type AppleVerifyResponse = {
  status: number;
  environment?: 'Sandbox' | 'Production';
  latest_receipt_info?: AppleLatestReceipt[];
  receipt?: {
    in_app?: AppleLatestReceipt[];
  };
};

type AppleLatestReceipt = {
  product_id: string;
  transaction_id: string;
  original_transaction_id: string;
  purchase_date_ms?: string;
  expires_date_ms?: string;
};

type PurchaseSource = 'user_purchase' | 'guest_purchase' | 'auto_renew';

type ProcessPurchaseInput = {
  userId: string;
  receiptData?: string | null;
  signedTransactions?: string[];
  source?: PurchaseSource;
};

type PurchaseDescriptor = {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expiresDate?: Date | null;
  environment: string;
  payload: Prisma.JsonValue;
};

export type UserSubscriptionStatus = {
  active: boolean;
  productId: string | null;
  expiresAt: string | null;
  lastPurchaseAt: string | null;
  lastTransactionId: string | null;
  environment: string | null;
};

export class SubscriptionError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

export async function processIosSubscriptionPurchase(input: ProcessPurchaseInput) {
  const source: PurchaseSource = input.source ?? 'user_purchase';
  const hasSigned = Array.isArray(input.signedTransactions) && input.signedTransactions.length > 0;
  const receiptValue = typeof input.receiptData === 'string' ? input.receiptData.trim() : '';
  const hasReceipt = receiptValue.length > 0;

  logAppleSubscriptionEvent('process_purchase_start', {
    userId: input.userId,
    source,
    hasReceipt,
    signedTransactionsCount: input.signedTransactions?.length ?? 0,
  });

  let signedError: unknown;

  if (hasSigned) {
    try {
      return await processSignedTransactions(input.userId, input.signedTransactions!, source);
    } catch (error) {
      signedError = error;
      if (!hasReceipt) {
        throw error;
      }
    }
  }

  if (hasReceipt) {
    return processReceiptPurchase(input.userId, receiptValue, source);
  }

  if (signedError instanceof Error) {
    throw signedError;
  }

  throw new SubscriptionError('Missing receipt data or signed transactions.');
}

export async function getUserSubscriptionStatus(userId: string): Promise<UserSubscriptionStatus> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - SUBSCRIPTION_STATUS_GRACE_MS);

  const activePurchase = await prisma.subscriptionPurchase.findFirst({
    where: {
      userId,
      OR: [
        { expiresDate: { gt: now } },
        {
          expiresDate: null,
          purchaseDate: { gt: staleThreshold },
        },
      ],
    },
    orderBy: [
      { expiresDate: 'desc' },
      { purchaseDate: 'desc' },
    ],
  });

  let latestPurchase = activePurchase;
  if (!latestPurchase) {
    latestPurchase = await prisma.subscriptionPurchase.findFirst({
      where: { userId },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  return {
    active: Boolean(activePurchase),
    productId: latestPurchase?.productId ?? null,
    expiresAt: latestPurchase?.expiresDate?.toISOString() ?? null,
    lastPurchaseAt: latestPurchase ? latestPurchase.purchaseDate.toISOString() : null,
    lastTransactionId: latestPurchase?.transactionId ?? null,
    environment: latestPurchase?.environment ?? null,
  };
}

async function processReceiptPurchase(userId: string, receiptData: string, source: PurchaseSource = 'user_purchase') {
  const secret = config.APPLE_IAP_SHARED_SECRET;
  if (!secret) {
    throw new SubscriptionError('Apple shared secret is not configured on the server.', 500);
  }

  const response = await verifyWithApple({
    receiptData,
    password: secret,
  });

  const receipt = pickRelevantReceipt(response);
  if (!receipt) {
    throw new SubscriptionError('Could not find a matching subscription in the receipt.');
  }

  const normalizedResponse = JSON.parse(JSON.stringify(response)) as Prisma.JsonValue;

  const descriptor: PurchaseDescriptor = {
    productId: receipt.product_id,
    transactionId: receipt.transaction_id,
    originalTransactionId: receipt.original_transaction_id,
    purchaseDate: coerceMillisToDate(receipt.purchase_date_ms) ?? new Date(),
    expiresDate: coerceMillisToDate(receipt.expires_date_ms),
    environment: response.environment ?? 'Production',
    payload: {
      source: 'receipt',
      response: normalizedResponse,
    } as Prisma.JsonValue,
  };

  logAppleSubscriptionEvent('receipt_purchase_parsed', {
    userId,
    source,
    productId: descriptor.productId,
    transactionId: descriptor.transactionId,
    originalTransactionId: descriptor.originalTransactionId,
    environment: descriptor.environment,
    expiresAt: descriptor.expiresDate?.toISOString() ?? null,
  });

  return finalizePurchase(userId, descriptor, source);
}

async function processSignedTransactions(userId: string, signedTransactions: string[], source: PurchaseSource = 'user_purchase') {
  const normalized = signedTransactions.filter((payload) => typeof payload === 'string' && payload.trim().length > 0);
  if (!normalized.length) {
    throw new SubscriptionError('Signed transaction payload missing.');
  }

  const decoded = await Promise.all(
    normalized.map(async (payload) => ({
      signedPayload: payload,
      decoded: await decodeSignedTransactionPayload(payload),
    })),
  );

  const candidates = decoded.filter(({ decoded: tx }) => {
    if (!tx.productId || !tx.transactionId) return false;
    return Boolean(getSubscriptionConfig(tx.productId));
  });

  logAppleSubscriptionEvent('signed_transactions_decoded', {
    userId,
    source,
    payloadCount: normalized.length,
    eligibleCount: candidates.length,
  });

  if (!candidates.length) {
    throw new SubscriptionError('Could not find a matching subscription in signed transactions.');
  }

  const newest = candidates.reduce((latest, current) => {
    const currentTime = Number(current.decoded.purchaseDate ?? current.decoded.signedDate ?? 0);
    const latestTime = Number(latest.decoded.purchaseDate ?? latest.decoded.signedDate ?? 0);
    return currentTime > latestTime ? current : latest;
  });

  const normalizedDecoded = JSON.parse(JSON.stringify(newest.decoded)) as Prisma.JsonValue;

  const descriptor: PurchaseDescriptor = {
    productId: newest.decoded.productId!,
    transactionId: newest.decoded.transactionId!,
    originalTransactionId: newest.decoded.originalTransactionId ?? newest.decoded.transactionId!,
    purchaseDate: coerceMillisToDate(newest.decoded.purchaseDate) ?? new Date(),
    expiresDate: coerceMillisToDate(newest.decoded.expiresDate),
    environment: String(newest.decoded.environment ?? 'Sandbox'),
    payload: {
      source: 'signedTransaction',
      signedTransaction: newest.signedPayload,
      decoded: normalizedDecoded,
    } as Prisma.JsonValue,
  };

  logAppleSubscriptionEvent('signed_transaction_selected', {
    userId,
    source,
    productId: descriptor.productId,
    transactionId: descriptor.transactionId,
    originalTransactionId: descriptor.originalTransactionId,
    environment: descriptor.environment,
    expiresAt: descriptor.expiresDate?.toISOString() ?? null,
  });

  return finalizePurchase(userId, descriptor, source);
}

async function finalizePurchase(userId: string, descriptor: PurchaseDescriptor, source: PurchaseSource) {
  const productConfig = getSubscriptionConfig(descriptor.productId);
  if (!productConfig) {
    throw new SubscriptionError(`Unsupported subscription product: ${descriptor.productId}`);
  }

  const existing = await prisma.subscriptionPurchase.findUnique({
    where: { transactionId: descriptor.transactionId },
  });
  if (existing) {
    if (existing.userId !== userId) {
      const transferred = await prisma.subscriptionPurchase.update({
        where: { transactionId: descriptor.transactionId },
        data: {
          userId,
          productId: descriptor.productId,
          originalTransactionId: descriptor.originalTransactionId,
          purchaseDate: descriptor.purchaseDate,
          expiresDate: descriptor.expiresDate ?? existing.expiresDate,
          environment: descriptor.environment,
          payload: descriptor.payload as Prisma.InputJsonValue,
        },
      });
      logAppleSubscriptionEvent('purchase_owner_transferred', {
        previousUserId: existing.userId,
        userId,
        source,
        productId: descriptor.productId,
        transactionId: descriptor.transactionId,
        expiresAt: transferred.expiresDate?.toISOString() ?? null,
      });
      return {
        alreadyProcessed: true,
        tokensGranted: 0,
        balance: await getUserBalance(userId),
        productId: descriptor.productId,
        transactionId: descriptor.transactionId,
        expiresAt: transferred.expiresDate?.toISOString() ?? null,
      };
    }
    let updated = existing;
    const expiresChanged = Boolean(
      descriptor.expiresDate &&
        (!existing.expiresDate || descriptor.expiresDate.getTime() !== existing.expiresDate.getTime()),
    );
    const purchaseChanged = descriptor.purchaseDate.getTime() !== existing.purchaseDate.getTime();
    const environmentChanged = descriptor.environment !== existing.environment;
    if (expiresChanged || purchaseChanged || environmentChanged) {
      updated = await prisma.subscriptionPurchase.update({
        where: { transactionId: descriptor.transactionId },
        data: {
          expiresDate: descriptor.expiresDate ?? existing.expiresDate,
          purchaseDate: descriptor.purchaseDate,
          environment: descriptor.environment,
          payload: descriptor.payload as Prisma.InputJsonValue,
        },
      });
      logAppleSubscriptionEvent('purchase_metadata_refreshed', {
        userId,
        source,
        transactionId: descriptor.transactionId,
        productId: descriptor.productId,
        expiresAt: updated.expiresDate?.toISOString() ?? null,
      });
    } else {
      logAppleSubscriptionEvent('purchase_already_processed', {
        userId,
        source,
        productId: descriptor.productId,
        transactionId: descriptor.transactionId,
      });
    }
    return {
      alreadyProcessed: true,
      tokensGranted: 0,
      balance: await getUserBalance(userId),
      productId: descriptor.productId,
      transactionId: descriptor.transactionId,
      expiresAt: updated.expiresDate?.toISOString() ?? null,
    };
  }

  const balance = await prisma.$transaction(async (tx) => {
    await tx.subscriptionPurchase.create({
      data: {
        userId,
        productId: descriptor.productId,
        originalTransactionId: descriptor.originalTransactionId,
        transactionId: descriptor.transactionId,
        environment: descriptor.environment,
        purchaseDate: descriptor.purchaseDate,
        expiresDate: descriptor.expiresDate ?? undefined,
        payload: descriptor.payload as Prisma.InputJsonValue,
      },
    });

    const newBalance = await grantTokens(
      {
        userId,
        amount: productConfig.tokens,
        type: TOKEN_TRANSACTION_TYPES.subscriptionCredit,
        description: `Subscription ${productConfig.label}`,
        metadata: {
          transactionId: descriptor.transactionId,
          productId: descriptor.productId,
        },
      },
      tx,
    );

    return newBalance;
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  const result = {
    alreadyProcessed: false,
    tokensGranted: productConfig.tokens,
    balance,
    productId: descriptor.productId,
    transactionId: descriptor.transactionId,
    expiresAt: descriptor.expiresDate?.toISOString() ?? null,
  };

  logAppleSubscriptionEvent('purchase_tokens_granted', {
    userId,
    source,
    productId: descriptor.productId,
    transactionId: descriptor.transactionId,
    originalTransactionId: descriptor.originalTransactionId,
    tokensGranted: productConfig.tokens,
    balance,
    environment: descriptor.environment,
    expiresAt: descriptor.expiresDate?.toISOString() ?? null,
  });

  notifyAdminsOfSubscriptionPurchase({
    userId,
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    productId: descriptor.productId,
    productLabel: productConfig.label,
    tokensGranted: productConfig.tokens,
    transactionId: descriptor.transactionId,
    originalTransactionId: descriptor.originalTransactionId,
    environment: descriptor.environment,
    balance,
    source,
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to send subscription purchase notification', err);
  });

  return result;
}

async function getUserBalance(userId: string) {
  const res = await prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
  return res?.tokenBalance ?? 0;
}

async function verifyWithApple({ receiptData, password }: { receiptData: string; password: string }) {
  const body = {
    'receipt-data': receiptData,
    password,
    'exclude-old-transactions': true,
  };

  let response = await callAppleVerifyEndpoint(APPLE_PRODUCTION_VERIFY_URL, body);
  if (response.status === 21007) {
    logAppleSubscriptionEvent('apple_verify_sandbox_redirect', {
      status: response.status,
      environment: response.environment,
    });
    response = await callAppleVerifyEndpoint(APPLE_SANDBOX_VERIFY_URL, body);
  }
  logAppleSubscriptionEvent('apple_verify_response', {
    status: response.status,
    environment: response.environment ?? 'Production',
    latestReceiptCount: response.latest_receipt_info?.length ?? 0,
    inAppCount: response.receipt?.in_app?.length ?? 0,
  });
  if (response.status !== 0) {
    throw new SubscriptionError(`Apple receipt validation failed with status ${response.status}`, mapAppleStatusToHttp(response.status));
  }
  return response;
}

async function callAppleVerifyEndpoint(url: string, body: Record<string, unknown>): Promise<AppleVerifyResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new SubscriptionError(`Apple verification HTTP error: ${res.status}`, 502);
  }
  return res.json() as Promise<AppleVerifyResponse>;
}

function pickRelevantReceipt(response: AppleVerifyResponse) {
  const candidates = response.latest_receipt_info ?? response.receipt?.in_app ?? [];
  if (!candidates.length) {
    return null;
  }
  const known = candidates.filter((item) => !!getSubscriptionConfig(item.product_id));
  if (!known.length) {
    return null;
  }
  return known.reduce((latest, current) => {
    const currentTime = Number(current.purchase_date_ms ?? 0);
    const latestTime = Number(latest.purchase_date_ms ?? 0);
    return currentTime > latestTime ? current : latest;
  });
}

function mapAppleStatusToHttp(status: number) {
  switch (status) {
    case 21002: // malformed receipt-data
      return 400;
    case 21003: // receipt could not be authenticated
    case 21004: // shared secret mismatch
      return 401;
    case 21005: // server unavailable
    case 21009: // internal data access error
      return 503;
    default:
      return 400;
  }
}

function coerceMillisToDate(value?: string | number | null) {
  if (value === null || value === undefined) return null;
  const ms = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}
