import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { withApiError } from '@/server/errors';
import { ok, forbidden, notFound } from '@/server/http';
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

export const GET = withApiError(async function GET(_req: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error!;
  const { entity, id } = await params;
  const item = await (mapModel(entity as AdminEntity) as any).findUnique({ where: { id } });
  if (!item) return notFound();
  return ok(item);
}, 'Failed to load record');

export const PATCH = withApiError(async function PATCH(req: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error!;
  const { entity, id } = await params;
  const schema = schemaFor(entity as AdminEntity);
  const json = await req.json();
  const parsed = schema.partial().safeParse(json);
  if (!parsed.success) return forbidden('Invalid payload');
  const updated = await (mapModel(entity as AdminEntity) as any).update({ where: { id }, data: parsed.data });
  return ok(updated);
}, 'Failed to update record');

export const DELETE = withApiError(async function DELETE(_req: NextRequest, { params }: { params: Promise<{ entity: string; id: string }> }) {
  const { session, error } = await requireAdminApiSession();
  if (!session) return error!;
  const { entity, id } = await params;
  await (mapModel(entity as AdminEntity) as any).delete({ where: { id } });
  return ok({ ok: true });
}, 'Failed to delete record');
