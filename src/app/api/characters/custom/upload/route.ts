import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiError } from '@/server/errors';
import { unauthorized, ok, error, forbidden, notFound } from '@/server/http';
import { prisma } from '@/server/db';
import { LIMITS } from '@/server/limits';
import { verifySignedUploadGrant, assertUploadGrantFresh } from '@/lib/upload-signature';
import { authenticateApiRequest } from '@/server/api-user';

const bodySchema = z.object({
  data: z.string().min(1),
  signature: z.string().min(1),
  path: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1).max(LIMITS.titleMax),
  description: z.string().max(LIMITS.customCharacterDescriptionMax).optional(),
  attachToCharacterId: z.string().uuid().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth) return unauthorized();
  const userId = auth.userId;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid upload payload', 400, parsed.error.flatten());
  }
  const { data, signature, path, url, title, description, attachToCharacterId } = parsed.data;
  let payload;
  try {
    payload = verifySignedUploadGrant(data, signature);
    assertUploadGrantFresh(payload);
  } catch (err: any) {
    return forbidden(err?.message || 'Invalid upload authorization');
  }
  if (payload.userId !== userId) {
    return forbidden('Upload authorization belongs to another user');
  }
  if (payload.purpose !== 'user-character-image') {
    return error('VALIDATION_ERROR', 'Upload authorization purpose mismatch', 400);
  }

  if (!path || path.includes('..')) {
    return error('VALIDATION_ERROR', 'Invalid upload path', 400);
  }
  const finalUrl = url && url.length > 0 ? url : path;

  const shortDescription = description ? description.slice(0, LIMITS.descriptionMax) : null;
  let userCharacterId: string;
  if (attachToCharacterId) {
    const existing = await prisma.userCharacter.findFirst({ where: { id: attachToCharacterId, userId, deleted: false } });
    if (!existing) return forbidden('Character not found');
    userCharacterId = existing.id;
  } else {
    const created = await prisma.userCharacter.create({
      data: {
        userId,
        title,
        description: shortDescription,
      },
    });
    userCharacterId = created.id;
  }

  const variation = await prisma.userCharacterVariation.create({
    data: {
      userCharacterId,
      title,
      description: shortDescription,
      imagePath: path,
      imageUrl: finalUrl,
      status: 'ready',
      source: 'upload',
    },
  });

  return ok({
    userCharacterId,
    variationId: variation.id,
  });
}, 'Failed to finalize character upload');
