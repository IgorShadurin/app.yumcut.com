import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { InsufficientTokensError } from '@/server/tokens';

type Normalized = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

// Known per-column character limits for MySQL schema (varchar columns)
const COLUMN_CHAR_LIMITS: Record<string, number> = {
  // Project
  title: 191,
  prompt: 191,
  rawScript: 191,
  status: 191,
  // History/message
  message: 191,
  // Character models
  description: 191,
};

function attachLimitHint(base: string, column?: string) {
  if (!column) return base;
  const limit = COLUMN_CHAR_LIMITS[column];
  if (limit) return `${base} (field "${column}", max ${limit} characters).`;
  return `${base} (field "${column}").`;
}

function fromPrismaKnown(e: Prisma.PrismaClientKnownRequestError, fallback: string): Normalized {
  const code = e.code;
  let message = fallback;
  const tags = ["prisma", code];
  switch (code) {
    case 'P2000':
      // Value too long for column
      // Try to include the exact column and known limit if available
      const col = (e as any)?.meta?.column_name || (e as any)?.meta?.column || (e as any)?.meta?.target;
      message = attachLimitHint(`${fallback}: One of the provided values is too long for the database column.`, typeof col === 'string' ? col : undefined);
      break;
    case 'P2002':
      message = `${fallback}: A record with the same value already exists.`;
      break;
    case 'P2003':
      message = `${fallback}: Invalid relation reference (missing related record).`;
      break;
    case 'P2025':
      message = `${fallback}: The requested record was not found.`;
      break;
    default:
      message = `${fallback}: A database error occurred (${code}).`;
  }
  return { status: 400, code, message, details: { tags, meta: (e as any).meta ?? null } };
}

function fromGenericError(err: Error, fallback: string): Normalized {
  const raw = (err && err.message) || String(err);
  const lower = raw.toLowerCase();
  // Heuristics for common DB/body issues
  if (lower.includes('data too long') || lower.includes('value too long')) {
    // Try to extract the column name from the MySQL error: Data too long for column 'prompt' at row 1
    const m = /column '(.*?)'/.exec(raw);
    const column = m?.[1];
    const msg = attachLimitHint(`${fallback}: Input is too long`, column);
    return { status: 400, code: 'DATA_TOO_LONG', message: msg, details: { raw, column } };
  }
  if (lower.includes('unexpected end of json input') || lower.includes('invalid json')) {
    return { status: 400, code: 'INVALID_JSON', message: `${fallback}: Malformed JSON in request body.`, details: { raw } };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: `${fallback}: ${raw || 'Internal error'}`, details: { raw } };
}

export function normalizeError(e: unknown, human: string): Normalized {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return fromPrismaKnown(e, human);
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, code: 'PRISMA_VALIDATION', message: `${human}: Invalid data provided.`, details: { raw: e.message } };
  }
  if (e instanceof InsufficientTokensError) {
    return { status: e.status, code: e.code, message: `${human}: ${e.message}`, details: e.details };
  }
  if (e instanceof Error) {
    return fromGenericError(e, human);
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: `${human}: Unknown error`, details: { raw: String(e) } };
}

export function respondNormalizedError(e: unknown, human: string) {
  const norm = normalizeError(e, human);
  return NextResponse.json({ error: { code: norm.code, message: norm.message, details: norm.details } }, { status: norm.status });
}

// Higher-order wrapper for route handlers to avoid per-file try/catch
export function withApiError<T extends (...args: any[]) => Promise<Response> | Response>(
  handler: T,
  human: string
): T {
  const wrapped = (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (e) {
      return respondNormalizedError(e, human);
    }
  }) as T;
  return wrapped;
}
