import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { deleteUserAccount } from '@/server/account/delete-user';
import { error, ok } from '@/server/http';
import { requireMobileUserId } from '@/app/api/mobile/shared/auth';

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(512).optional(),
});

export const POST = withApiError(async function POST(req: NextRequest) {
  const auth = await requireMobileUserId(req);
  if ('error' in auth) {
    return auth.error;
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const parsed = bodySchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten());
  }

  const result = await deleteUserAccount({ userId: auth.userId, source: 'mobile', reason: parsed.data.reason ?? null });
  return ok({
    status: result.alreadyDeleted ? 'already_deleted' : 'deleted',
    message: result.alreadyDeleted
      ? 'This YumCut account was already deleted. Create a new account to continue.'
      : 'Your YumCut account has been deleted. Create a new account if you return.',
  });
}, 'Failed to delete mobile account');
