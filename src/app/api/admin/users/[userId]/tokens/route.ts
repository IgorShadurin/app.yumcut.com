import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { requireAdminApiSession } from '@/server/admin';
import { error, ok } from '@/server/http';
import { grantTokens, spendTokens, TOKEN_TRANSACTION_TYPES } from '@/server/tokens';

const schema = z.object({
  amount: z.number().int().refine((value) => value !== 0, 'Amount must be non-zero'),
  reason: z.string().trim().max(512).optional(),
});

type Params = { userId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const { session, error: authError } = await requireAdminApiSession();
  if (authError) return authError;
  const { userId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }

  const { amount, reason } = parsed.data;
  const initiator = `admin:${(session?.user as any)?.email || (session?.user as any)?.id}`;
  const description = reason || 'Adjusted by administrator';

  let balance: number;
  if (amount > 0) {
    balance = await grantTokens({
      userId,
      amount,
      type: TOKEN_TRANSACTION_TYPES.adminAdjustment,
      description,
      initiator,
      metadata: { adjustedBy: (session?.user as any)?.id },
    });
  } else {
    balance = await spendTokens({
      userId,
      amount: Math.abs(amount),
      type: TOKEN_TRANSACTION_TYPES.adminAdjustment,
      description,
      initiator,
      metadata: { adjustedBy: (session?.user as any)?.id },
    });
  }

  return ok({ balance });
}, 'Failed to adjust tokens');
