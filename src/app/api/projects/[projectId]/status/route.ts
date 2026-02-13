import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { prisma } from '@/server/db';
import { ok, unauthorized, notFound } from '@/server/http';
import { withApiError } from '@/server/errors';
import { ProjectStatus } from '@/shared/constants/status';
import { normalizeMediaUrl } from '@/server/storage';
import { getLatestErrorLog } from '@/server/projects/errors';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { sortAudioCandidatesByCreatedAtDesc } from '@/server/projects/helpers';
import { sanitizeStatusInfoForUser } from '../../shared/sanitize-status';

type Params = { projectId: string };

export const GET = withApiError(async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const { projectId } = await params;
  const p = await prisma.project.findFirst({
    where: { id: projectId, userId, deleted: false },
    include: {
      scripts: true,
      audios: true,
      videos: true,
      statusLog: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!p) return notFound('Project not found');

    const status = p.status as ProjectStatus;
    const latestLog = p.statusLog[0];
    let statusInfo: Record<string, unknown> | undefined = undefined;

    const languages = normalizeLanguageList(
      (p as any)?.languages ?? DEFAULT_LANGUAGE,
      DEFAULT_LANGUAGE,
    );
    const primaryLanguage = languages[0] ?? DEFAULT_LANGUAGE;
    const scripts = (p as any).scripts as Array<{ languageCode: string; text: string }> | undefined;
    const primaryScript = scripts?.find((s) => s.languageCode === primaryLanguage) ?? scripts?.[0] ?? null;

    const sortedAudios = sortAudioCandidatesByCreatedAtDesc(
      p.audios as Array<{
        id: string;
        path: string;
        publicUrl?: string | null;
        languageCode?: string | null;
        createdAt?: Date | string | null;
      }>,
    );

    switch (status) {
      case ProjectStatus.ProcessScriptValidate:
        statusInfo = { scriptText: primaryScript?.text || '', languageCode: primaryScript?.languageCode ?? primaryLanguage };
        break;
      case ProjectStatus.ProcessAudioValidate:
        statusInfo = {
          audioCandidates: sortedAudios.map((a: any) => ({
            id: a.id,
            path: (a as any).publicUrl || normalizeMediaUrl(a.path),
            languageCode: a.languageCode ?? primaryLanguage,
            createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt ?? null,
          })),
          ...(p as any).finalVoiceoverUrl
            ? { finalVoiceoverPath: (p as any).finalVoiceoverUrl }
            : (p as any).finalVoiceoverPath
              ? { finalVoiceoverPath: normalizeMediaUrl((p as any).finalVoiceoverPath) }
              : {},
        } as any;
        break;
      case ProjectStatus.Error: {
        const errorLog = await getLatestErrorLog(prisma, p.id);
        statusInfo = {
          message: errorLog?.message || latestLog?.message || 'Unknown error',
          ...(p as any).finalVoiceoverUrl
            ? { finalVoiceoverPath: (p as any).finalVoiceoverUrl }
            : (p as any).finalVoiceoverPath
              ? { finalVoiceoverPath: normalizeMediaUrl((p as any).finalVoiceoverPath) }
              : {},
        } as any;
        break;
      }
      case ProjectStatus.Done: {
        const final = p.videos.find((v: any) => v.isFinal);
        const finalVideoPath =
          (final as any)?.publicUrl
          || (p as any).finalVideoUrl
          || normalizeMediaUrl(final?.path || (p as any).finalVideoPath || null);
        const finalVoiceoverPath =
          (p as any).finalVoiceoverUrl
          || normalizeMediaUrl((p as any).finalVoiceoverPath);
        statusInfo = {
          url: finalVideoPath,
          ...(finalVideoPath ? { finalVideoPath } : {}),
          ...(finalVoiceoverPath ? { finalVoiceoverPath } : {}),
        } as any;
        break;
      }
      default: {
        const extra = (latestLog?.extra as any) || undefined;
        statusInfo = {
          ...(extra || {}),
          ...(p as any).finalVoiceoverUrl
            ? { finalVoiceoverPath: (p as any).finalVoiceoverUrl }
            : (p as any).finalVoiceoverPath
              ? { finalVoiceoverPath: normalizeMediaUrl((p as any).finalVoiceoverPath) }
              : {},
        } as any;
        break;
      }
    }

  const sanitizedStatusInfo = sanitizeStatusInfoForUser(statusInfo);

  return ok({
    status,
    statusInfo: sanitizedStatusInfo,
    updatedAt: p.updatedAt.toISOString(),
  });
}, 'Failed to load status');
