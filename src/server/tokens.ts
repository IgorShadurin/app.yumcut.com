import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './db';
import { TOKEN_TRANSACTION_TYPES, TokenTransactionType } from '@/shared/constants/token-costs';

export class InsufficientTokensError extends Error {
  public readonly code = 'INSUFFICIENT_TOKENS';
  public readonly status = 402;
  public readonly details: { balance: number; required: number };

  constructor(balance: number, required: number) {
    super(`Not enough tokens. Required ${required}, available ${balance}.`);
    this.name = 'InsufficientTokensError';
    this.details = { balance, required };
  }
}

export type TokenLedgerClient = Prisma.TransactionClient | PrismaClient;

export interface BaseTokenChange {
  userId: string;
  type: TokenTransactionType;
  description?: string | null;
  initiator?: string | null;
  metadata?: Prisma.JsonValue;
}

export interface GrantTokensInput extends BaseTokenChange {
  amount: number;
}

export interface SpendTokensInput extends BaseTokenChange {
  amount: number;
}

function ensureClient(client?: TokenLedgerClient) {
  return client ?? prisma;
}

export async function grantTokens(input: GrantTokensInput, client?: TokenLedgerClient) {
  const runner = ensureClient(client);
  if (input.amount <= 0) {
    throw new Error('Token amount must be positive when granting.');
  }
  const res = await runner.user.update({
    where: { id: input.userId },
    data: { tokenBalance: { increment: input.amount } },
    select: { tokenBalance: true },
  });
  await runner.tokenTransaction.create({
    data: {
      userId: input.userId,
      delta: input.amount,
      balanceAfter: res.tokenBalance,
      type: input.type,
      description: input.description || null,
      initiator: input.initiator || null,
      metadata: input.metadata ?? undefined,
    },
  });
  return res.tokenBalance;
}

export async function spendTokens(input: SpendTokensInput, client?: TokenLedgerClient) {
  const runner = ensureClient(client);
  if (input.amount <= 0) {
    throw new Error('Token amount must be positive when spending.');
  }

  const updated = await runner.user.updateMany({
    where: { id: input.userId, tokenBalance: { gte: input.amount } },
    data: { tokenBalance: { decrement: input.amount } },
  });

  if (updated.count === 0) {
    const current = await runner.user.findUnique({ where: { id: input.userId }, select: { tokenBalance: true } });
    const balance = current?.tokenBalance ?? 0;
    throw new InsufficientTokensError(balance, input.amount);
  }

  const after = await runner.user.findUnique({ where: { id: input.userId }, select: { tokenBalance: true } });
  const balanceAfter = after?.tokenBalance ?? 0;

  await runner.tokenTransaction.create({
    data: {
      userId: input.userId,
      delta: -input.amount,
      balanceAfter,
      type: input.type,
      description: input.description || null,
      initiator: input.initiator || null,
      metadata: input.metadata ?? undefined,
    },
  });

  return balanceAfter;
}

export async function getTokenSummary(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenBalance: true } });
  return { balance: user?.tokenBalance ?? 0 };
}

export interface TokenHistoryParams {
  userId: string;
  page: number;
  pageSize: number;
}

export async function getTokenHistory({ userId, page, pageSize }: TokenHistoryParams) {
  const take = Math.min(Math.max(pageSize, 1), 100);
  const skip = Math.max(page - 1, 0) * take;
  const [items, total] = await prisma.$transaction([
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.tokenTransaction.count({ where: { userId } }),
  ]);
  return {
    items,
    total,
    page,
    pageSize: take,
    totalPages: Math.max(Math.ceil(total / take), 1),
  };
}

export function makeUserInitiator(userId: string) {
  return `user:${userId}`;
}

export function makeSystemInitiator(tag: string) {
  return `system:${tag}`;
}

export { TOKEN_TRANSACTION_TYPES };
