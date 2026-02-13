"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle, Clapperboard, Download, FolderDown, Loader2 } from 'lucide-react';
import type { ProjectLanguageVariantDTO } from '@/shared/types';
import { ProjectStatus } from '@/shared/constants/status';
import { toast } from 'sonner';
import { Tooltip } from '@/components/common/Tooltip';
import { LanguageTabsList } from './LanguageTabsList';
import { ProjectVideoRegenerateButton } from './ProjectVideoRegenerateButton';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type Props = {
  variants: ProjectLanguageVariantDTO[];
  primaryLanguage: string;
  projectStatus: ProjectStatus;
  fallbackUrl?: string | null;
  title?: string | null;
  projectId: string;
  failedLanguages?: string[] | null;
  videoLogs?: Record<string, string | null | undefined> | null;
  videoErrors?: Record<string, string | null | undefined> | null;
  canRecreate?: boolean;
};

type VideoVariant = {
  languageCode: string;
  url: string | null;
  isPrimary: boolean;
  status: 'ready' | 'processing' | 'error';
  logPath?: string | null;
  errorMessage?: string | null;
};

const VIDEO_STAGE_STATUSES: ProjectStatus[] = [
  ProjectStatus.ProcessVideoPartsGeneration,
  ProjectStatus.ProcessVideoMain,
  ProjectStatus.Done,
];

function buildDownloadUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined);
    u.searchParams.set('download', '1');
    return u.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + 'download=1';
  }
}

const PATH_SEGMENT_SANITIZER = /[\\/:*?"<>|]+/g;

type DirectoryPickerOptions = {
  mode?: 'read' | 'readwrite';
};

export function ProjectFinalVideoCard({
  variants,
  primaryLanguage,
  projectStatus,
  fallbackUrl,
  title,
  projectId,
  failedLanguages,
  videoLogs,
  videoErrors,
  canRecreate = false,
}: Props) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    downloadNotSupported: string;
    downloadNotSupportedDescription: string;
    noVideosYet: string;
    allVideosSaved: string;
    allVideosSavedDescription: (savedCount: number, folder: string) => string;
    downloadFailed: string;
    downloadFailedDescription: string;
    videoFallbackTitle: string;
    processingNotice: (langCode: string) => string;
    errorNotice: (langCode: string) => string;
    title: string;
    downloadCurrentVideo: (langCode: string) => string;
    downloadFinalVideoAria: string;
    videoStillRenderingTooltip: string;
    videoStillProcessingAria: string;
    downloadAllTooltip: string;
    downloadAllLockedTooltip: string;
    downloadAllAria: string;
    downloadAllLockedAria: string;
    downloadAll: string;
    downloadAllPendingHint: string;
    saveAsHint: string;
    renderingHint: string;
    logsPrefix: string;
    renderingFailedTooltip: (langCode: string) => string;
  }> = {
    en: {
      downloadNotSupported: 'Download not supported',
      downloadNotSupportedDescription:
        'Your browser does not support saving to a folder. Use a Chromium-based browser and try again.',
      noVideosYet: 'No videos available yet',
      allVideosSaved: 'All videos saved',
      allVideosSavedDescription: (savedCount, folder) => `Stored ${savedCount} files in ${folder}/`,
      downloadFailed: 'Download failed',
      downloadFailedDescription: 'We could not save the videos. Please try again.',
      videoFallbackTitle: 'video',
      processingNotice: (langCode) => `Final video for ${langCode} is processing and will be available soon.`,
      errorNotice: (langCode) => `Final video for ${langCode} failed. The team will re-run this stage shortly.`,
      title: 'Final Videos',
      downloadCurrentVideo: (langCode) => `Download current video (${langCode})`,
      downloadFinalVideoAria: 'Download final video',
      videoStillRenderingTooltip: 'Video is still rendering for this language. Check back soon.',
      videoStillProcessingAria: 'Video still processing',
      downloadAllTooltip: 'Download all rendered videos to a folder',
      downloadAllLockedTooltip: 'Download all will unlock once every video has finished rendering',
      downloadAllAria: 'Download all videos',
      downloadAllLockedAria: 'Download all videos (available once all videos are ready)',
      downloadAll: 'Download all',
      downloadAllPendingHint: 'Download all will be enabled once every language finishes rendering.',
      saveAsHint:
        'If your browser opens a new tab instead of downloading, right-click the Download button and choose “Save link as…”.',
      renderingHint:
        'Videos are rendering for each language. You will be able to preview and download them here once they are ready.',
      logsPrefix: 'Logs',
      renderingFailedTooltip: (langCode) => `Rendering for ${langCode} failed.`,
    },
    ru: {
      downloadNotSupported: 'Скачивание не поддерживается',
      downloadNotSupportedDescription:
        'Ваш браузер не поддерживает сохранение сразу в папку. Используйте браузер на базе Chromium.',
      noVideosYet: 'Пока нет доступных видео',
      allVideosSaved: 'Все видео сохранены',
      allVideosSavedDescription: (savedCount, folder) => `Сохранено ${savedCount} файлов в папку ${folder}/`,
      downloadFailed: 'Ошибка скачивания',
      downloadFailedDescription: 'Не удалось сохранить видео. Попробуйте ещё раз.',
      videoFallbackTitle: 'video',
      processingNotice: (langCode) => `Финальное видео для ${langCode} ещё обрабатывается и скоро будет доступно.`,
      errorNotice: (langCode) => `Финальное видео для ${langCode} завершилось с ошибкой. Мы перезапустим этот этап.`,
      title: 'Финальные видео',
      downloadCurrentVideo: (langCode) => `Скачать текущее видео (${langCode})`,
      downloadFinalVideoAria: 'Скачать финальное видео',
      videoStillRenderingTooltip: 'Видео для этого языка ещё рендерится. Попробуйте позже.',
      videoStillProcessingAria: 'Видео ещё обрабатывается',
      downloadAllTooltip: 'Скачать все готовые видео в папку',
      downloadAllLockedTooltip: 'Кнопка станет доступна, когда все видео закончат рендер',
      downloadAllAria: 'Скачать все видео',
      downloadAllLockedAria: 'Скачать все видео (доступно после завершения рендера всех языков)',
      downloadAll: 'Скачать все',
      downloadAllPendingHint: 'Скачать все можно будет после завершения рендера всех языков.',
      saveAsHint:
        'Если браузер открывает новую вкладку вместо скачивания, нажмите правой кнопкой на кнопку «Скачать» и выберите «Сохранить ссылку как…».',
      renderingHint:
        'Видео по языкам ещё рендерятся. Здесь появится предпросмотр и скачивание, как только они будут готовы.',
      logsPrefix: 'Логи',
      renderingFailedTooltip: (langCode) => `Рендер для ${langCode} завершился с ошибкой.`,
    },
  };
  const t = copy[language];

  const failedSet = useMemo(() => new Set((failedLanguages ?? []).map((code) => code.toLowerCase())), [failedLanguages]);
  const logsByLanguage = useMemo(() => videoLogs ?? {}, [videoLogs]);
  const errorsByLanguage = useMemo(() => videoErrors ?? {}, [videoErrors]);

  const videoVariants = useMemo<VideoVariant[]>(() => {
    const mapped = variants.map<VideoVariant>((variant) => ({
      languageCode: variant.languageCode,
      url: variant.finalVideoUrl || variant.finalVideoPath || null,
      isPrimary: Boolean(variant.isPrimary),
      status: 'processing' as VideoVariant['status'],
      logPath: logsByLanguage[variant.languageCode] ?? logsByLanguage[variant.languageCode.toLowerCase()] ?? null,
      errorMessage: errorsByLanguage[variant.languageCode] ?? errorsByLanguage[variant.languageCode.toLowerCase()] ?? null,
    }));

    if (mapped.length === 0) {
      return [{
        languageCode: primaryLanguage,
        url: fallbackUrl ?? null,
        isPrimary: true,
        status: (fallbackUrl ? 'ready' : 'processing'),
        logPath: logsByLanguage[primaryLanguage] ?? logsByLanguage[primaryLanguage.toLowerCase()] ?? null,
        errorMessage: errorsByLanguage[primaryLanguage] ?? errorsByLanguage[primaryLanguage.toLowerCase()] ?? null,
      }];
    }

    if (!mapped.some((entry) => entry.isPrimary)) {
      const fallback = mapped.find((entry) => entry.languageCode === primaryLanguage);
      if (fallback) fallback.isPrimary = true;
    }

    for (const entry of mapped) {
      const codeLower = entry.languageCode.toLowerCase();
      if (failedSet.has(codeLower)) {
        entry.status = 'error';
        entry.errorMessage = entry.errorMessage ?? errorsByLanguage[entry.languageCode] ?? errorsByLanguage[codeLower] ?? null;
      } else if (entry.url) {
        entry.status = 'ready';
      } else {
        entry.status = 'processing';
      }
      if (!entry.logPath) {
        entry.logPath = logsByLanguage[entry.languageCode] ?? logsByLanguage[codeLower] ?? null;
      }
    }

    return mapped;
  }, [variants, fallbackUrl, primaryLanguage, failedSet, logsByLanguage]);

  const initialLanguage = useMemo(() => {
    const primaryEntry = videoVariants.find((entry) => entry.isPrimary);
    return (primaryEntry ?? videoVariants[0] ?? { languageCode: primaryLanguage }).languageCode;
  }, [videoVariants, primaryLanguage]);

  const [activeLanguage, setActiveLanguage] = useState<string>(initialLanguage);

  const hasAnyVideo = videoVariants.some((entry) => entry.status === 'ready' && Boolean(entry.url));
  const shouldRender = hasAnyVideo || VIDEO_STAGE_STATUSES.includes(projectStatus);
  const hasMultipleVideos = videoVariants.length > 1;
  const allVideosReady = hasMultipleVideos ? videoVariants.every((entry) => entry.status === 'ready' && Boolean(entry.url)) : false;
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const tabItems = useMemo(
    () =>
      videoVariants.map((entry) => ({
        languageCode: entry.languageCode,
        status: entry.status,
        ready: entry.status === 'ready',
        tooltip:
          entry.status === 'error'
            ? [
                t.renderingFailedTooltip(entry.languageCode.toUpperCase()),
                entry.errorMessage ? `\n${entry.errorMessage}` : null,
                entry.logPath ? `\n${t.logsPrefix}: ${entry.logPath}` : null,
              ]
                .filter(Boolean)
                .join('')
            : undefined,
      })),
    [t, videoVariants],
  );

  const safeProjectId = useMemo(() => {
    const candidate = projectId.replace(PATH_SEGMENT_SANITIZER, '-').trim();
    return candidate.length > 0 ? candidate : 'project';
  }, [projectId]);

  const handleDownloadAll = useCallback(async () => {
    if (!hasMultipleVideos || !allVideosReady || isDownloadingAll) {
      return;
    }

    if (typeof window === 'undefined') return;
    const directoryPicker = (window as typeof window & { showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (typeof directoryPicker !== 'function') {
      toast.error(t.downloadNotSupported, { description: t.downloadNotSupportedDescription });
      return;
    }

    const downloadableEntries = videoVariants.filter((entry): entry is VideoVariant & { url: string } => Boolean(entry.url));
    if (downloadableEntries.length === 0) {
      toast.error(t.noVideosYet);
      return;
    }

    setIsDownloadingAll(true);
    setDownloadProgress({ current: 1, total: downloadableEntries.length });
    try {
      const rootDirectory = await directoryPicker({ mode: 'readwrite' });
      const projectDirectory = await rootDirectory.getDirectoryHandle(safeProjectId, { create: true });
      let savedCount = 0;
      for (const entry of downloadableEntries) {
        setDownloadProgress({ current: savedCount + 1, total: downloadableEntries.length });
        const languageCode = entry.languageCode.toLowerCase();
        const downloadTarget = buildDownloadUrl(entry.url) ?? entry.url;
        const response = await fetch(downloadTarget, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`Failed to download ${languageCode.toUpperCase()}`);
        }
        const fileHandle = await projectDirectory.getFileHandle(`${languageCode}.mp4`, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(await response.blob());
        } finally {
          await writable.close();
        }
        savedCount += 1;
      }
      setDownloadProgress({ current: downloadableEntries.length, total: downloadableEntries.length });
      toast.success(t.allVideosSaved, { description: t.allVideosSavedDescription(savedCount, safeProjectId) });
    } catch (error) {
      const err = error as DOMException | Error;
      if ((err as DOMException)?.name === 'AbortError') {
        return;
      }
      toast.error(t.downloadFailed, { description: err.message || t.downloadFailedDescription });
    } finally {
      setIsDownloadingAll(false);
      setTimeout(() => setDownloadProgress({ current: 0, total: 0 }), 400);
    }
  }, [
    allVideosReady,
    hasMultipleVideos,
    isDownloadingAll,
    safeProjectId,
    t.allVideosSaved,
    t.allVideosSavedDescription,
    t.downloadFailed,
    t.downloadFailedDescription,
    t.downloadNotSupported,
    t.downloadNotSupportedDescription,
    t.noVideosYet,
    videoVariants,
  ]);

  useEffect(() => {
    if (videoVariants.length === 0) return;
    if (!videoVariants.some((entry) => entry.languageCode === activeLanguage)) {
      const fallback = videoVariants.find((entry) => entry.isPrimary) ?? videoVariants[0] ?? null;
      if (fallback) {
        setActiveLanguage(fallback.languageCode);
      }
    }
  }, [activeLanguage, videoVariants]);

  if (!shouldRender) return null;

  const activeEntry = videoVariants.find((entry) => entry.languageCode === activeLanguage) ?? videoVariants[0] ?? null;
  const activeUrl = activeEntry?.url ?? null;
  const downloadUrl = buildDownloadUrl(activeUrl);
  const safeTitle = (title || t.videoFallbackTitle)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || t.videoFallbackTitle;
  const downloadName = `${safeTitle}-${(activeEntry?.languageCode ?? primaryLanguage).toLowerCase()}.mp4`;

const renderProcessingNotice = (languageCode: string) => (
  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
    <div>
      {t.processingNotice(languageCode.toUpperCase())}
    </div>
  </div>
);

  const renderErrorNotice = (languageCode: string, logPath?: string | null, errorMessage?: string | null) => (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-sm text-amber-600 dark:text-amber-300">
      <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />
      <div className="max-w-[320px]">
        {t.errorNotice(languageCode.toUpperCase())}
      </div>
      {(errorMessage || logPath) ? (
        <div className="space-y-2 text-xs text-amber-700 dark:text-amber-200/90 max-w-[320px] break-words">
          {errorMessage ? <p>{errorMessage}</p> : null}
              {logPath ? (
                <code className="block truncate rounded bg-amber-50 px-3 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {logPath}
            </code>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-cyan-500" />
          {t.title}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <ProjectVideoRegenerateButton
            projectId={projectId}
            projectStatus={projectStatus}
            canRecreate={canRecreate}
            size="sm"
            variant="default"
            className="flex items-center"
          />
          {activeUrl ? (
            <Tooltip content={t.downloadCurrentVideo((activeEntry?.languageCode ?? primaryLanguage).toUpperCase())}>
              <Button asChild variant="outline" size="icon">
                <a href={downloadUrl ?? activeUrl} download={downloadName} aria-label={t.downloadFinalVideoAria}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content={t.videoStillRenderingTooltip}>
              <Button variant="outline" size="icon" disabled aria-label={t.videoStillProcessingAria}>
                <Download className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
          {hasMultipleVideos ? (
            <Tooltip content={allVideosReady ? t.downloadAllTooltip : t.downloadAllLockedTooltip}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={handleDownloadAll}
                disabled={!allVideosReady || isDownloadingAll}
                aria-label={allVideosReady ? t.downloadAllAria : t.downloadAllLockedAria}
              >
                {isDownloadingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">
                      {downloadProgress.current}/{downloadProgress.total || videoVariants.length}
                    </span>
                  </>
                ) : (
                  <>
                    <FolderDown className="h-4 w-4" />
                    <span className="text-xs font-medium">{t.downloadAll}</span>
                  </>
                )}
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-3">
        {hasMultipleVideos && !allVideosReady ? (
          <p className="text-xs text-muted-foreground">
            {t.downloadAllPendingHint}
          </p>
        ) : null}
        {videoVariants.length > 1 ? (
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage}>
            <LanguageTabsList
              items={tabItems}
            />
            {videoVariants.map((entry) => (
              <TabsContent key={entry.languageCode} value={entry.languageCode} className="mt-3">
                {entry.status === 'ready' && entry.url ? (
                  <div className="flex justify-center">
                    <div className="w-full max-w-[281px] sm:max-w-[320px] md:max-w-[360px]">
                      <div className="aspect-[9/16] overflow-hidden rounded-lg border bg-black">
                        <video controls className="h-full w-full object-contain" src={entry.url} />
                      </div>
                    </div>
                  </div>
                ) : entry.status === 'error' ? (
                  renderErrorNotice(entry.languageCode, entry.logPath, entry.errorMessage)
                ) : (
                  renderProcessingNotice(entry.languageCode)
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <>
            {activeEntry?.status === 'ready' && activeUrl ? (
              <div className="flex justify-center">
                <div className="w-full max-w-[281px] sm:max-w-[320px] md:max-w-[360px]">
                  <div className="aspect-[9/16] overflow-hidden rounded-lg border bg-black">
                    <video controls className="h-full w-full object-contain" src={activeUrl} />
                  </div>
                </div>
              </div>
            ) : activeEntry?.status === 'error' ? (
              renderErrorNotice(activeEntry.languageCode, activeEntry.logPath, activeEntry.errorMessage)
            ) : (
              renderProcessingNotice(activeLanguage)
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {hasAnyVideo
            ? t.saveAsHint
            : t.renderingHint}
        </p>
      </CardContent>
    </Card>
  );
}
