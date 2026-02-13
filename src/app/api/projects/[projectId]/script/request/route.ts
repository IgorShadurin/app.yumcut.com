import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { textRequestSchema } from '@/server/validators/projects';
import { LIMITS } from '@/server/limits';
import { spendTokens, TOKEN_TRANSACTION_TYPES, makeUserInitiator } from '@/server/tokens';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  const json = await req.json();
  const parsed = textRequestSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());
  const { text, languageCode, propagateTranslations } = parsed.data;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');
  const projectLanguages = normalizeLanguageList((project as any)?.languages ?? (project as any)?.targetLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
  const requestedLanguage = languageCode && projectLanguages.includes(languageCode)
    ? languageCode
    : primaryLanguage;

  await prisma.$transaction(async (tx) => {
    const cost = TOKEN_COSTS.actions.scriptRevision;
    if (cost > 0) {
      await spendTokens({
        userId,
        amount: cost,
        type: TOKEN_TRANSACTION_TYPES.scriptRevision,
        description: 'Script refinement request',
        initiator: makeUserInitiator(userId),
        metadata: { projectId: project.id },
      }, tx);
    }

    await tx.scriptRequest.create({ data: { projectId: project.id, text } });

    await tx.audioCandidate.deleteMany({ where: { projectId: project.id } });
    await tx.projectTemplateImage.deleteMany({ where: { projectId: project.id } });
    await tx.imageAsset.deleteMany({ where: { projectId: project.id } });
    await tx.videoAsset.deleteMany({ where: { projectId: project.id } });

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.ProcessScript,
        finalScriptText: null,
        finalVoiceoverId: null,
        finalVoiceoverPath: null,
        finalVoiceoverUrl: null,
        finalVideoPath: null,
        finalVideoUrl: null,
      } as any,
    });

    await tx.projectStatusHistory.create({
      data: {
        projectId: project.id,
        status: ProjectStatus.ProcessScript,
        message: 'User requested script refinement',
      },
    });

    const userSettings = await tx.userSettings.findUnique({ where: { userId } });

    await tx.job.create({
      data: {
        projectId: project.id,
        userId,
        type: 'script',
        status: 'queued',
        payload: {
          reason: 'script_refinement',
          requestText: text,
          scriptCreationGuidanceEnabled: !!(userSettings as any)?.scriptCreationGuidanceEnabled,
          scriptCreationGuidance:
            (userSettings as any)?.scriptCreationGuidanceEnabled
              ? ((userSettings as any)?.scriptCreationGuidance ?? '')
              : '',
          scriptAvoidanceGuidanceEnabled: !!(userSettings as any)?.scriptAvoidanceGuidanceEnabled,
          scriptAvoidanceGuidance:
            (userSettings as any)?.scriptAvoidanceGuidanceEnabled
              ? ((userSettings as any)?.scriptAvoidanceGuidance ?? '')
              : '',
          audioStyleGuidanceEnabled: !!(userSettings as any)?.audioStyleGuidanceEnabled,
          audioStyleGuidance:
            (userSettings as any)?.audioStyleGuidanceEnabled
              ? ((userSettings as any)?.audioStyleGuidance ?? '').slice(0, LIMITS.audioStyleGuidanceMax)
              : '',
          languageCode: requestedLanguage,
          languages: [requestedLanguage],
          refinePropagateTranslations: propagateTranslations,
        },
      },
    });
  });
  return ok({ ok: true });
}, 'Failed to request script change');
