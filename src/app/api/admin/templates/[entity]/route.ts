import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { withApiError } from '@/server/errors';
import { ok, forbidden } from '@/server/http';
import { requireAdminApiSession } from '@/server/admin';
import { schemaFor, type AdminEntity } from '@/shared/validators/templates';

function mapModel(entity: AdminEntity) {
  switch (entity) {
    case 'templates': return (prisma as any).template;
    case 'art-styles': return (prisma as any).templateArtStyle;
    case 'voice-styles': return (prisma as any).templateVoiceStyle;
    case 'voices': return (prisma as any).templateVoice;
    case 'music': return (prisma as any).templateMusic;
    case 'captions-styles': return (prisma as any).templateCaptionsStyle;
    case 'overlays': return (prisma as any).templateOverlay;
  }
}

export const GET = withApiError(async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error!;
  const { entity } = await params;
  const model = mapModel(entity as AdminEntity);
  const orderBy = entity === 'templates'
    ? [{ weight: 'desc' }, { createdAt: 'desc' }]
    : { createdAt: 'desc' };
  const items = await (model as any).findMany({ orderBy });
  return ok(items);
}, 'Failed to list records');

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error!;
  const { entity } = await params;
  const schema = schemaFor(entity as AdminEntity);
  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return forbidden('Invalid payload');
  }
  const data: any = { ...parsed.data };
  // Ownership for ownable tables
  if (entity === 'art-styles' || entity === 'audio-styles' || entity === 'music') {
    data.ownerId = (session.user as any).id;
  }
  if (entity === 'templates') {
    data.ownerId = (session.user as any).id;
  }
  const model = mapModel(entity as AdminEntity);
  const created = await (model as any).create({ data });
  return ok(created, { status: 201 });
}, 'Failed to create record');
