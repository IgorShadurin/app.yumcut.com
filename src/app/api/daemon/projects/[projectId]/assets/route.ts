import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { ok, forbidden, notFound, error } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';
import { normalizeMediaUrl, toStoredMediaPath, recordStoragePublicUrlHint } from '@/server/storage';
import { daemonAssetRegisterSchema } from '@/server/validators/daemon';
import { normalizeLanguageList, DEFAULT_LANGUAGE } from '@/shared/constants/languages';

// Keep this handler on Node to work with Prisma and other Node-only APIs.
export const runtime = 'nodejs';
// Avoid static caching because daemon asset writes must hit live DB updates.
export const dynamic = 'force-dynamic';
// Allow large JSON payloads should we accept fallback multipart uploads in the future.
type Params = { projectId: string };

type AssetResponse =
  | { kind: 'audio'; id: string; path: string; url: string }
  | { kind: 'image'; id: string; path: string; url: string }
  | { kind: 'video'; id: string; path: string; url: string; isFinal: boolean };

export const POST = withApiError(async function POST(req: NextRequest, { params }: { params: Promise<Params> }) {
  const daemonId = await assertDaemonAuth(req);
  if (!daemonId) return forbidden('Invalid daemon credentials');
  const { projectId } = await params;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return notFound('Project not found');
  if (project.currentDaemonId && project.currentDaemonId !== daemonId) {
    return forbidden('Project locked by another daemon');
  }

  const json = await req.json().catch(() => null);
  if (!json || typeof json !== 'object') {
    return error('VALIDATION_ERROR', 'Invalid payload', 400);
  }
  const parsed = daemonAssetRegisterSchema.safeParse(json);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid payload', 400);
  }

  const { type: kind, url, path, isFinal: parsedIsFinal = false, localPath, languageCode } = parsed.data;
  recordStoragePublicUrlHint(url);
  const storedPath = toStoredMediaPath(url);
  const isFinal = kind === 'video' && Boolean(parsedIsFinal);
  const normalizedUrl = normalizeMediaUrl(storedPath);
  const responseUrl = (() => {
    if (normalizedUrl && /^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
    if (url && /^https?:\/\//i.test(url)) return url;
    return normalizedUrl || url || storedPath;
  })();
  let response: AssetResponse;

  const normalizedLanguage = languageCode ? languageCode.toLowerCase() : null;

  if (kind === 'audio') {
    const record = await prisma.audioCandidate.create({ data: { projectId, path: storedPath, publicUrl: responseUrl, localPath: localPath || null, languageCode: languageCode ?? null, isFinal: false } as any });
    response = { kind, id: record.id, path: record.path, url: responseUrl };
  } else if (kind === 'image') {
    const record = await prisma.imageAsset.create({ data: { projectId, path: storedPath, publicUrl: responseUrl } });
    response = { kind, id: record.id, path: record.path, url: responseUrl };
  } else {
    if (isFinal) {
      const rawLanguages = Array.isArray((project as any).languages) && (project as any).languages.length > 0
        ? (project as any).languages
        : ((project as any).targetLanguage ? [(project as any).targetLanguage] : [DEFAULT_LANGUAGE]);
      const languages = normalizeLanguageList(rawLanguages, DEFAULT_LANGUAGE);
      const primaryLanguage = languages[0] ?? DEFAULT_LANGUAGE;
      const isPrimaryLanguage = !normalizedLanguage || normalizedLanguage === primaryLanguage;

      const transactions: any[] = [
        prisma.videoAsset.updateMany({
          where: {
            projectId,
            ...(normalizedLanguage ? { languageCode: normalizedLanguage } : { OR: [{ languageCode: null }, { languageCode: '' }] }),
          },
          data: { isFinal: false },
        }),
        prisma.videoAsset.create({
          data: {
            projectId,
            path: storedPath,
            publicUrl: responseUrl,
            isFinal: true,
            languageCode: normalizedLanguage,
          },
        }),
      ];
      if (isPrimaryLanguage) {
        transactions.push(prisma.project.update({
          where: { id: projectId },
          data: { finalVideoPath: storedPath, finalVideoUrl: responseUrl } as any,
        }));
      }
      const [, asset] = await prisma.$transaction(transactions);
      response = { kind, id: asset.id, path: asset.path, url: responseUrl, isFinal: true };
    } else {
      const record = await prisma.videoAsset.create({
        data: {
          projectId,
          path: storedPath,
          publicUrl: responseUrl,
          isFinal: false,
          languageCode: normalizedLanguage,
        },
      });
      response = { kind, id: record.id, path: record.path, url: responseUrl, isFinal: false };
    }
  }

  return ok(response);
}, 'Failed to store daemon asset');
