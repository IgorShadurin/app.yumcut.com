import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { approveScriptSchema } from '@/server/validators/projects';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');
  if (project.status !== ProjectStatus.ProcessScriptValidate) {
    return error('CONFLICT', 'Project is not awaiting script approval', 409);
  }

  const json = await req.json();
  const parsed = approveScriptSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const projectLanguages = normalizeLanguageList((project as any)?.languages ?? (project as any)?.targetLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;

  const scriptsPayload = 'scripts' in parsed.data
    ? parsed.data.scripts.map((entry) => ({
        languageCode: entry.languageCode,
        text: entry.text.trim(),
      }))
    : [{
        languageCode: parsed.data.languageCode && projectLanguages.includes(parsed.data.languageCode)
          ? parsed.data.languageCode
          : primaryLanguage,
        text: parsed.data.text.trim(),
      }];

  const scriptMap = new Map<string, string>();
  for (const entry of scriptsPayload) {
    if (!projectLanguages.includes(entry.languageCode)) {
      return error('VALIDATION_ERROR', `Language ${entry.languageCode} is not enabled for this project`, 400);
    }
    if (!entry.text) {
      return error('VALIDATION_ERROR', `Script for ${entry.languageCode} cannot be empty`, 400);
    }
    scriptMap.set(entry.languageCode, entry.text);
  }

  const missingLanguages = projectLanguages.filter((code) => !scriptMap.has(code));
  if (missingLanguages.length > 0) {
    return error('VALIDATION_ERROR', `Missing scripts for languages: ${missingLanguages.join(', ')}`, 400);
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      projectLanguages.map((languageCode) =>
        tx.projectLanguageProgress.upsert({
          where: { projectId_languageCode: { projectId: project.id, languageCode } },
          update: {},
          create: { projectId: project.id, languageCode },
        }),
      ),
    );

    await Promise.all(
      Array.from(scriptMap.entries()).map(([languageCode, text]) =>
        tx.script.upsert({
          where: { projectId_languageCode: { projectId: project.id, languageCode } },
          update: { text },
          create: { projectId: project.id, languageCode, text },
        }),
      ),
    );

    const primaryText = scriptMap.get(primaryLanguage) ?? Array.from(scriptMap.values())[0];
    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.ProcessAudio,
        finalScriptText: primaryText,
      } as any,
    });
    await tx.projectStatusHistory.create({
      data: {
        projectId: project.id,
        status: ProjectStatus.ProcessAudio,
        extra: { languages: Array.from(scriptMap.keys()) },
      },
    });
  });

  return ok({ ok: true });
}, 'Failed to approve script');
