import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { unauthorized, ok, error } from '@/server/http';
import { issueSignedUploadGrant } from '@/lib/upload-signature';
import { authenticateApiRequest } from '@/server/api-user';

const bodySchema = z.object({
  ttlMs: z.number().int().min(1_000).max(30 * 60 * 1_000).optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid upload token payload', 400, parsed.error.flatten());
  }

  const grant = issueSignedUploadGrant({
    userId,
    purpose: 'user-character-image',
    ttlMs: parsed.data.ttlMs,
  });

  return ok({
    data: grant.data,
    signature: grant.signature,
    expiresAt: grant.payload.expiresAt,
    mimeTypes: grant.payload.mimeTypes,
    maxBytes: grant.payload.maxBytes,
  });
}, 'Failed to create storage upload token');
