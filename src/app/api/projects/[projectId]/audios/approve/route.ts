import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { approveAudioSchema } from '@/server/validators/projects';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE, TargetLanguageCode } from '@/shared/constants/languages';

type Params = { projectId: string };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  const json = await req.json();
  const parsed = approveAudioSchema.safeParse(json);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid payload', 400, parsed.error.flatten());

  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return notFound('Project not found');

  const projectLanguages = normalizeLanguageList((project as any).languages ?? (project as any).targetLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;

  const selections = 'selections' in parsed.data
    ? parsed.data.selections
    : [{ languageCode: primaryLanguage, audioId: parsed.data.audioId }];

  const uniqueSelections = new Map<string, string>();
  for (const entry of selections) {
    const code = entry.languageCode.toLowerCase() as TargetLanguageCode;
    if (!projectLanguages.includes(code)) {
      return error('VALIDATION_ERROR', `Language ${entry.languageCode} is not enabled for this project`, 400);
    }
    uniqueSelections.set(code, entry.audioId);
  }

  const missing = projectLanguages.filter((code) => !uniqueSelections.has(code));
  if (missing.length > 0) {
    return error('VALIDATION_ERROR', `Missing audio selections for languages: ${missing.join(', ')}`, 400);
  }

  const audioIds = Array.from(uniqueSelections.values());
  const candidates = await prisma.audioCandidate.findMany({
    where: { projectId: project.id, id: { in: audioIds } },
  });
  if (candidates.length !== audioIds.length) {
    return notFound('One or more audio candidates were not found');
  }
  const candidateMap = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const code = (candidate.languageCode || DEFAULT_LANGUAGE).toLowerCase();
    candidateMap.set(code, candidate);
  }

  for (const languageCode of projectLanguages) {
    if (!candidateMap.has(languageCode)) {
      return error('VALIDATION_ERROR', `Audio candidate for ${languageCode} is missing`, 400);
    }
  }

  const primaryCandidate = candidateMap.get(primaryLanguage);
  if (!primaryCandidate) {
    return error('VALIDATION_ERROR', `Primary language ${primaryLanguage} is missing an approved audio`, 400);
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
    await tx.projectLanguageProgress.updateMany({
      where: { projectId: project.id },
      data: {
        transcriptionDone: false,
        captionsDone: false,
        videoPartsDone: false,
        finalVideoDone: false,
      },
    });

    await tx.audioCandidate.updateMany({
      where: { projectId: project.id },
      data: { isFinal: false },
    });

    for (const [languageCode, candidate] of candidateMap.entries()) {
      await tx.audioCandidate.update({
        where: { id: candidate.id },
        data: { isFinal: true },
      });
    }

    const finalVoiceoverPaths: Record<string, string | null> = {};
    const finalVoiceoverUrls: Record<string, string | null> = {};
    const finalVoiceoverLocalPaths: Record<string, string | null> = {};
    const finalVoiceovers: Record<string, string> = {};
    for (const languageCode of projectLanguages) {
      const candidate = candidateMap.get(languageCode)!;
      finalVoiceovers[languageCode] = candidate.id;
      finalVoiceoverPaths[languageCode] = candidate.path;
      finalVoiceoverUrls[languageCode] = candidate.publicUrl ?? null;
      finalVoiceoverLocalPaths[languageCode] = (candidate as any).localPath ?? null;
    }

    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.ProcessTranscription,
        finalVoiceoverId: primaryCandidate.id,
        finalVoiceoverPath: primaryCandidate.path,
        finalVoiceoverUrl: primaryCandidate.publicUrl || null,
      } as any,
    });
    await tx.projectStatusHistory.create({
      data: {
        projectId: project.id,
        status: ProjectStatus.ProcessTranscription,
        extra: {
          finalVoiceoverId: primaryCandidate.id,
          finalVoiceoverPath: primaryCandidate.path,
          finalVoiceoverUrl: primaryCandidate.publicUrl || null,
          audioLocalPath: (primaryCandidate as any).localPath ?? null,
          primaryLanguage,
          finalVoiceovers,
          finalVoiceoverPaths,
          finalVoiceoverUrls,
          finalVoiceoverLocalPaths,
          audioLanguages: projectLanguages,
        },
      },
    });

    await tx.job.deleteMany({ where: { projectId: project.id, type: 'transcription', status: { in: ['queued', 'running'] } } });
    await Promise.all(projectLanguages.map(async (languageCode) => {
      const candidate = candidateMap.get(languageCode);
      if (!candidate) throw new Error(`Audio candidate missing for ${languageCode}`);
      const payload = {
        languageCode,
        audioCandidateId: candidate.id,
        audioLocalPath: finalVoiceoverLocalPaths[languageCode] ?? (candidate as any).localPath ?? null,
        audioPath: candidate.path,
        audioUrl: candidate.publicUrl ?? null,
      };
      await tx.job.create({
        data: {
          projectId: project.id,
          userId,
          type: 'transcription',
          status: 'queued',
          payload,
        },
      });
    }));
  });

  const finalVoiceoversResponse = Array.from(candidateMap.entries()).reduce<Record<string, string>>((acc, [language, candidate]) => {
    acc[language] = candidate.id;
    return acc;
  }, {});

  return ok({
    ok: true,
    primaryLanguage,
    finalVoiceoverId: primaryCandidate.id,
    finalVoiceovers: finalVoiceoversResponse,
  });
}, 'Failed to approve audio');
