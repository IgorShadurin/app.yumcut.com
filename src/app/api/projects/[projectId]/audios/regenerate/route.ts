import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ProjectStatus } from '@/shared/constants/status';
import { spendTokens, TOKEN_TRANSACTION_TYPES, makeUserInitiator } from '@/server/tokens';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import type { TargetLanguageCode } from '@/shared/constants/languages';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');

  const json = await req.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return error('VALIDATION_ERROR', 'languageCode is required', 400);
  }
  const { languageCode: rawLanguage } = json as { languageCode?: unknown };
  const projectLanguages = normalizeLanguageList((project as any).languages ?? (project as any).targetLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE) as TargetLanguageCode[];
  const candidateLanguage = typeof rawLanguage === 'string' ? rawLanguage.toLowerCase() : projectLanguages[0];
  const languageCode = projectLanguages.find((code) => code === candidateLanguage) ?? projectLanguages[0];
  if (!projectLanguages.includes(languageCode)) {
    return error('VALIDATION_ERROR', 'Language not available for this project', 400);
  }
  const isPrimary = languageCode === projectLanguages[0];

  await prisma.$transaction(async (tx) => {
    const cost = TOKEN_COSTS.actions.audioRegeneration;
    if (cost > 0) {
      await spendTokens({
        userId,
        amount: cost,
        type: TOKEN_TRANSACTION_TYPES.audioRegeneration,
        description: 'Audio regeneration',
        initiator: makeUserInitiator(userId),
        metadata: { projectId: project.id },
      }, tx);
    }

    await tx.audioCandidate.updateMany({ where: { projectId: project.id, languageCode }, data: { isFinal: false } });
    await tx.audioCandidate.deleteMany({ where: { projectId: project.id, languageCode } });
    if (isPrimary) {
      await tx.project.update({
        where: { id: project.id },
        data: {
          status: ProjectStatus.ProcessAudio,
          finalVoiceoverId: null,
          finalVoiceoverPath: null,
          finalVoiceoverUrl: null,
        } as any,
      });
    } else {
      await tx.project.update({
        where: { id: project.id },
        data: {
          status: ProjectStatus.ProcessAudio,
        },
      });
    }
    await tx.projectStatusHistory.create({
      data: {
        projectId: project.id,
        status: ProjectStatus.ProcessAudio,
        message: `User requested ${languageCode.toUpperCase()} audio regeneration`,
        extra: { languageCode },
      },
    });

    await tx.job.deleteMany({ where: { projectId: project.id, type: 'audio', status: { in: ['queued', 'running'] } } });
    await tx.projectLanguageProgress.upsert({
      where: { projectId_languageCode: { projectId: project.id, languageCode } },
      update: {
        transcriptionDone: false,
        captionsDone: false,
        videoPartsDone: false,
        finalVideoDone: false,
      },
      create: {
        projectId: project.id,
        languageCode,
        transcriptionDone: false,
        captionsDone: false,
        videoPartsDone: false,
        finalVideoDone: false,
      },
    });
    await tx.job.create({
      data: {
        projectId: project.id,
        userId,
        type: 'audio',
        status: 'queued',
        payload: {
          reason: 'audio_regeneration',
          audioLanguage: languageCode,
          languages: projectLanguages,
        },
      },
    });
  });

  return ok({ ok: true, languageCode });
}, 'Failed to regenerate audios');
