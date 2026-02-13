import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { unauthorized, error, ok } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { deleteUserAccount } from '@/server/account/delete-user';

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(512).optional(),
});

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const userId = session?.user && (session.user as any).id;
  if (!userId) {
    return unauthorized();
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

  const result = await deleteUserAccount({ userId, source: 'web', reason: parsed.data.reason ?? null });
  return ok({
    status: result.alreadyDeleted ? 'already_deleted' : 'deleted',
    message: result.alreadyDeleted
      ? 'Your YumCut account was already deleted. Create a new account to use the service again.'
      : 'Your YumCut account has been deleted. Create a new account to return in the future.',
  });
}, 'Failed to delete account');
