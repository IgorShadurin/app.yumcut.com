import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { forbidden, notFound, ok, error } from '@/server/http';
import { prisma } from '@/server/db';
import { issueSignedDaemonUploadGrant } from '@/lib/upload-signature';

const bodySchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(['audio', 'image', 'video', 'character-image']),
  ttlMs: z.number().int().min(1_000).max(60 * 60 * 1000).optional(),
  maxBytes: z.number().int().positive().optional(),
  mimeTypes: z.array(z.string().min(1)).nonempty().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid daemon upload grant payload', 400, parsed.error.flatten());
  }
  const { projectId, kind, ttlMs, maxBytes, mimeTypes } = parsed.data;

  const projectExists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!projectExists) return notFound('Project not found');

  const grant = issueSignedDaemonUploadGrant({
    projectId,
    kind,
    ttlMs,
    maxBytes,
    mimeTypes,
  });

  return ok({
    data: grant.data,
    signature: grant.signature,
    expiresAt: grant.payload.expiresAt,
    maxBytes: grant.payload.maxBytes,
    mimeTypes: grant.payload.mimeTypes,
    kind: grant.payload.kind,
    projectId: grant.payload.projectId,
  });
}, 'Failed to issue daemon upload grant');
