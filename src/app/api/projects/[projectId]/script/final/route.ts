import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { finalScriptEditSchema } from '@/server/validators/projects';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deleted: false },
    select: { id: true, status: true, languages: true },
  });
  if (!project) return notFound('Project not found');
  if (project.status !== ProjectStatus.Done) {
    return error('CONFLICT', 'Project is not ready for script edits', 409);
  }

  const json = await req.json();
  const parsed = finalScriptEditSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const projectLanguages = normalizeLanguageList((project as any)?.languages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
  const languageCode = parsed.data.languageCode && projectLanguages.includes(parsed.data.languageCode)
    ? parsed.data.languageCode
    : primaryLanguage;
  if (!projectLanguages.includes(languageCode)) {
    return error('VALIDATION_ERROR', `Language ${languageCode} is not enabled for this project`, 400);
  }

  const text = parsed.data.text.trim();

  const result = await prisma.$transaction(async (tx) => {
    const script = await tx.script.upsert({
      where: { projectId_languageCode: { projectId: project.id, languageCode } },
      update: { text },
      create: { projectId: project.id, languageCode, text },
    });
    const updatedProject = languageCode === primaryLanguage
      ? await tx.project.update({
          where: { id: project.id },
          data: { finalScriptText: text },
          select: { finalScriptText: true },
        })
      : null;
    return { script, finalScriptText: updatedProject?.finalScriptText ?? null };
  });

  return ok({
    languageCode,
    text: result.script.text,
    finalScriptText: result.finalScriptText,
  });
}, 'Failed to update final script');
