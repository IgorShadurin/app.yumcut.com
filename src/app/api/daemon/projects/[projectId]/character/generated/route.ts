import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { forbidden, notFound, ok, error } from '@/server/http';
import { prisma } from '@/server/db';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const path: string | null = typeof body?.path === 'string' ? body.path : null;
  const url: string | null = typeof body?.url === 'string' ? body.url : null;
  const title: string | null = typeof body?.title === 'string' ? body.title : null;
  const description: string | null = typeof body?.description === 'string' ? body.description : null;
  if (!path && !url) return error('VALIDATION_ERROR', 'image path or url is required', 400);

  const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true, currentDaemonId: true } });
  if (!proj) return notFound('Project not found');
  if (proj.currentDaemonId && proj.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  // Create a user character and variation for reuse
  const character = await prisma.userCharacter.create({
    data: {
      userId: proj.userId,
      title: title && title.trim().length > 0 ? title.trim() : 'Generated Character',
      description: description ?? `Generated for project ${projectId}`,
    },
  });
  const variation = await prisma.userCharacterVariation.create({
    data: {
      userCharacterId: character.id,
      title: 'Auto',
      description: null,
      prompt: null,
      imagePath: path || null,
      imageUrl: url || null,
      status: 'ready',
      source: 'daemon',
    },
  });

  // Attach selection to project so UI picks it up
  await prisma.projectCharacterSelection.upsert({
    where: { projectId },
    update: {
      userCharacterId: character.id,
      userCharacterVariationId: variation.id,
      characterId: null,
      characterVariationId: null,
    },
    create: {
      projectId,
      userCharacterId: character.id,
      userCharacterVariationId: variation.id,
    },
  });

  return ok({ characterId: character.id, variationId: variation.id });
}, 'Failed to register generated character');
