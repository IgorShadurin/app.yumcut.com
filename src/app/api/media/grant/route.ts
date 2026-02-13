import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { ok, forbidden, unauthorized, error } from '@/server/http';
import { getAuthSession } from '@/server/auth';
import { resolveMediaOwner } from '@/server/media-access';
import { toStoredMediaPath, buildPublicMediaUrl } from '@/server/storage';
import { issueSignedMediaDownloadGrant } from '@/lib/upload-signature';

const bodySchema = z.object({
  path: z.string().min(1),
  disposition: z.enum(['attachment', 'inline']).optional(),
  ttlMs: z.number().int().min(1_000).max(60 * 60 * 1000).optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return unauthorized();

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid media grant payload', 400, parsed.error.flatten());
  }

  let normalizedPath: string;
  try {
    normalizedPath = toStoredMediaPath(parsed.data.path);
  } catch (err: any) {
    return error('VALIDATION_ERROR', err?.message || 'Invalid media path', 400);
  }

  const owner = await resolveMediaOwner(normalizedPath);
  if (!owner) return forbidden('File not found');
  if (owner.userId !== userId) return forbidden('Access denied');

  const grant = issueSignedMediaDownloadGrant({
    path: normalizedPath,
    userId,
    disposition: parsed.data.disposition,
    ttlMs: parsed.data.ttlMs,
  });

  const url = buildPublicMediaUrl(normalizedPath);
  const separator = url.includes('?') ? '&' : '?';
  const signedUrl = `${url}${separator}data=${encodeURIComponent(grant.data)}&sig=${encodeURIComponent(grant.signature)}`;

  return ok({
    url: signedUrl,
    data: grant.data,
    signature: grant.signature,
    expiresAt: grant.payload.expiresAt,
    path: normalizedPath,
  });
}, 'Failed to issue media download grant');
