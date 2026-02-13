import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';

type Params = { projectId: string };

export const GET = withApiError(async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const finals = await prisma.audioCandidate.findMany({ where: { projectId, isFinal: true } });
  const finalMap = finals.reduce<Record<string, { id: string; path: string; publicUrl: string | null; localPath: string | null }>>((acc, candidate) => {
    const code = (candidate.languageCode ?? DEFAULT_LANGUAGE).toLowerCase();
    acc[code] = {
      id: candidate.id,
      path: candidate.path,
      publicUrl: candidate.publicUrl ?? null,
      localPath: (candidate as any).localPath ?? null,
    };
    return acc;
  }, {});

  const primaryLanguage = normalizeLanguageList((project as any)?.languages ?? (project as any)?.targetLanguage ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE)[0] ?? DEFAULT_LANGUAGE;
  const primarySelection = project.finalVoiceoverId
    ? finals.find((candidate) => candidate.id === project.finalVoiceoverId)
    : finals.find((candidate) => (candidate.languageCode ?? DEFAULT_LANGUAGE).toLowerCase() === primaryLanguage)
      ?? finals[0]
      ?? null;

  const finalId = primarySelection?.id ?? project.finalVoiceoverId ?? null;
  let localPath: string | null = null;
  let storagePath: string | null = null;
  let publicUrl: string | null = null;

  if (primarySelection) {
    const withLocal = primarySelection as typeof primarySelection & { localPath?: string | null };
    localPath = withLocal.localPath ?? null;
    storagePath = primarySelection.path;
    publicUrl = primarySelection.publicUrl ?? null;
  }

  if (!localPath) {
    const history = await prisma.projectStatusHistory.findFirst({
      where: { projectId, status: { in: [ProjectStatus.ProcessTranscription, ProjectStatus.ProcessAudioValidate] as any } },
      orderBy: { createdAt: 'desc' },
    });
    const extra = (history?.extra as any) || {};
    if (typeof extra?.audioLocalPath === 'string') {
      localPath = extra.audioLocalPath;
    } else if (extra?.candidateLocalPaths && typeof extra.candidateLocalPaths === 'object' && finalId) {
      const fallback = extra.candidateLocalPaths[finalId];
      if (typeof fallback === 'string') {
        localPath = fallback;
      }
    }
  }

  return ok({
    finalVoiceoverId: finalId,
    localPath,
    storagePath,
    publicUrl,
    finalVoiceovers: finalMap,
  });
}, 'Failed to load transcription snapshot');
