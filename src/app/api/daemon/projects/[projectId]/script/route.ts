import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { daemonScriptUpsertSchema } from '@/server/validators/daemon';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';

type Params = { projectId: string };

export const GET = withApiError(async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, currentDaemonId: true } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const url = new URL(req.url);
  const requestedLanguage = url.searchParams.get('language') || undefined;
  const script = requestedLanguage
    ? await prisma.script.findUnique({ where: { projectId_languageCode: { projectId, languageCode: requestedLanguage } } })
    : await prisma.script.findFirst({ where: { projectId }, orderBy: { updatedAt: 'desc' } });
  return ok({ text: script?.text ?? null, languageCode: script?.languageCode ?? requestedLanguage ?? null });
}, 'Failed to load script');

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const json = await req.json();
  const parsed = daemonScriptUpsertSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const languageCode = parsed.data.languageCode ?? DEFAULT_LANGUAGE;
  await prisma.script.upsert({
    where: { projectId_languageCode: { projectId, languageCode } },
    create: { projectId, languageCode, text: parsed.data.text },
    update: { text: parsed.data.text },
  });
  return ok({ ok: true });
}, 'Failed to upsert script');
