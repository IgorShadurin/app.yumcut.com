"use client";
import { useProject } from '@/hooks/useProject';
import { ScriptEditor } from './ScriptEditor';
import { AudioApproval } from './AudioApproval';
import { ProjectStatus } from '@/shared/constants/status';
import { STATUS_INFO } from '@/shared/constants/status-info';
import { ProjectSettingsBar } from './ProjectSettingsBar';
import { Tooltip } from '@/components/common/Tooltip';
import { StatusIcon } from '@/components/common/StatusIcon';
import { ProjectPromptCard } from './ProjectPromptCard';
import { ProjectApprovedScriptCard } from './ProjectApprovedScriptCard';
import { ProjectApprovedAudioCard } from './ProjectApprovedAudioCard';
import { ProjectFinalVideoCard } from './ProjectFinalVideoCard';
import { SchedulerSection } from './SchedulerSection';
import { ProjectErrorCard } from './ProjectErrorCard';
import { ProjectImageEditorSection } from './ProjectImageEditorSection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRouter } from 'next/navigation';
import { Api } from '@/lib/api-client';
import { AlertTriangle, MoreVertical, Trash2, FileText } from 'lucide-react';
import { useState } from 'react';
import type { ProjectLanguageVariantDTO } from '@/shared/types';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type ProjectScreenCopy = {
  statusFallback: string;
  loadingProjectError: string;
  notFound: string;
  projectActions: string;
  delete: string;
  scriptApproval: string;
  scriptApprovalDescription: string;
  deleteProjectTitle: string;
  deleteProjectDescription: string;
  deleteProjectWarning: string;
  cancel: string;
};

const COPY: Record<AppLanguageCode, ProjectScreenCopy> = {
  en: {
    statusFallback: 'Status',
    loadingProjectError: 'Error loading project.',
    notFound: 'Not found.',
    projectActions: 'Project actions',
    delete: 'Delete',
    scriptApproval: 'Script approval',
    scriptApprovalDescription: 'Review and finalize each language before we generate voiceovers.',
    deleteProjectTitle: 'Delete project?',
    deleteProjectDescription: 'This will remove the project from your list. You can’t undo this action.',
    deleteProjectWarning: 'Note: Any tokens spent to create or process this project will not be compensated or refunded.',
    cancel: 'Cancel',
  },
  ru: {
    statusFallback: 'Статус',
    loadingProjectError: 'Ошибка загрузки проекта.',
    notFound: 'Не найдено.',
    projectActions: 'Действия проекта',
    delete: 'Удалить',
    scriptApproval: 'Подтверждение сценария',
    scriptApprovalDescription: 'Проверьте и подтвердите каждый язык перед генерацией озвучки.',
    deleteProjectTitle: 'Удалить проект?',
    deleteProjectDescription: 'Проект будет удалён из списка. Это действие нельзя отменить.',
    deleteProjectWarning: 'Важно: токены, потраченные на создание и обработку проекта, не компенсируются и не возвращаются.',
    cancel: 'Отмена',
  },
};

const STATUS_INFO_RU: Partial<Record<ProjectStatus, { label: string; description: string }>> = {
  [ProjectStatus.New]: { label: 'В очереди', description: 'Проект поставлен в очередь на обработку.' },
  [ProjectStatus.ProcessScript]: { label: 'Генерация сценария', description: 'Создаём сценарий из вашей идеи.' },
  [ProjectStatus.ProcessScriptValidate]: { label: 'Сценарий готов к проверке', description: 'Проверьте и подтвердите сценарий для продолжения.' },
  [ProjectStatus.ProcessAudio]: { label: 'Генерация озвучки', description: 'Создаём озвучку по утверждённому сценарию.' },
  [ProjectStatus.ProcessAudioValidate]: { label: 'Озвучка готова к выбору', description: 'Выберите нужный вариант озвучки.' },
  [ProjectStatus.ProcessTranscription]: { label: 'Транскрибация', description: 'Формируем текстовую транскрибацию из озвучки.' },
  [ProjectStatus.ProcessMetadata]: { label: 'Генерация метаданных', description: 'Создаём заголовки, описания и другие метаданные.' },
  [ProjectStatus.ProcessCaptionsVideo]: { label: 'Генерация слоя субтитров', description: 'Рендерим прозрачный слой субтитров для финального ролика.' },
  [ProjectStatus.ProcessImagesGeneration]: { label: 'Генерация изображений', description: 'Создаём визуалы для вашего ролика.' },
  [ProjectStatus.ProcessVideoPartsGeneration]: { label: 'Рендер частей видео', description: 'Рендерим части и подготавливаем сборку ролика.' },
  [ProjectStatus.ProcessVideoMain]: { label: 'Сборка финального видео', description: 'Объединяем звук, визуалы и переходы в итоговый ролик.' },
  [ProjectStatus.Error]: { label: 'Ошибка', description: 'Во время обработки проекта произошла ошибка.' },
  [ProjectStatus.Done]: { label: 'Готово', description: 'Ваше видео готово к просмотру и скачиванию.' },
  [ProjectStatus.Cancelled]: { label: 'Отменено', description: 'Обработка отменена.' },
};

export function ProjectScreen({ projectId }: { projectId: string }) {
  const { language } = useAppLanguage();
  const t = COPY[language];
  const { project, loading, error, refresh } = useProject(projectId);
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full skeleton" />
          <div className="h-6 w-48 rounded-md skeleton" />
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5">
          <div className="h-4 w-16 rounded-md skeleton mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded skeleton" />
            <div className="h-4 w-11/12 rounded skeleton" />
            <div className="h-4 w-10/12 rounded skeleton" />
            <div className="h-4 w-9/12 rounded skeleton" />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-5 w-36 rounded-md skeleton" />
            <div className="h-6 w-12 rounded-full skeleton" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="h-4 w-36 rounded skeleton" />
              <div className="h-6 w-20 rounded-full skeleton" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-36 rounded skeleton" />
              <div className="h-6 w-28 rounded-full skeleton" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-36 rounded skeleton" />
              <div className="h-6 w-14 rounded-full skeleton" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-36 rounded skeleton" />
              <div className="h-6 w-14 rounded-full skeleton" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-40 rounded skeleton" />
              <div className="h-6 w-16 rounded-full skeleton" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-40 rounded skeleton" />
              <div className="h-6 w-16 rounded-full skeleton" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <div className="h-4 w-36 rounded skeleton" />
              <div className="h-6 w-28 rounded-full skeleton" />
              <div className="h-6 w-24 rounded-full skeleton" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (error) return <div>{t.loadingProjectError}</div>;
  if (!project) return <div>{t.notFound}</div>;

  const statusInfo = language === 'ru'
    ? { ...STATUS_INFO, ...STATUS_INFO_RU }
    : STATUS_INFO;
  const languageVariants = (project.languageVariants as ProjectLanguageVariantDTO[] | undefined) ?? [];
  const primaryVariant = languageVariants.find((v) => v.isPrimary) ?? languageVariants[0] ?? null;
  const primaryLanguage = primaryVariant?.languageCode || project.creation?.targetLanguage || project.languages?.[0] || 'en';
  const projectExtraInfo = (project.statusInfo as Record<string, any> | null | undefined) ?? undefined;
  const finalVideoUrl =
    project.finalVideoUrl
    ?? project.finalVideoPath
    ?? (project.statusInfo && ((project.statusInfo as any).finalVideoPath || (project.statusInfo as any).url))
    ?? null;
  const failedVideoLanguages: string[] = Array.isArray(projectExtraInfo?.failedLanguages)
    ? (projectExtraInfo.failedLanguages as Array<string | null | undefined>).filter(Boolean).map((code) => String(code))
    : [];
  const videoLogMap = projectExtraInfo?.videoLogs && typeof projectExtraInfo.videoLogs === 'object'
    ? projectExtraInfo.videoLogs as Record<string, string | null | undefined>
    : undefined;
  const videoErrorsMap = projectExtraInfo?.videoErrors && typeof projectExtraInfo.videoErrors === 'object'
    ? projectExtraInfo.videoErrors as Record<string, string | null | undefined>
    : undefined;
  const isScriptMode = !!project.creation?.useExactTextAsScript;
  const showScriptEditor = project.status === ProjectStatus.ProcessScriptValidate && !isScriptMode;
  const resolvedScriptText = project.finalScriptText
    ?? primaryVariant?.scriptText
    ?? (project.statusInfo as any)?.scriptText
    ?? '';
  const showApprovedScript = (project.status !== ProjectStatus.ProcessScriptValidate || isScriptMode)
    && resolvedScriptText.trim().length > 0;
  const VOICEOVER_VISIBLE_STATUSES: ProjectStatus[] = [
    ProjectStatus.ProcessAudio,
    ProjectStatus.ProcessAudioValidate,
    ProjectStatus.ProcessTranscription,
    ProjectStatus.ProcessMetadata,
    ProjectStatus.ProcessCaptionsVideo,
    ProjectStatus.ProcessImagesGeneration,
    ProjectStatus.ProcessVideoPartsGeneration,
    ProjectStatus.ProcessVideoMain,
    ProjectStatus.Done,
    ProjectStatus.Error,
    ProjectStatus.Cancelled,
  ];
  const showApprovedAudioSection = VOICEOVER_VISIBLE_STATUSES.includes(project.status as ProjectStatus);
  const imageEditorEnabled = Boolean((project as any)?.imageEditorEnabled);
  const isCustomTemplate = (project as any)?.template?.customData?.type === 'custom';
  const showImageEditor = imageEditorEnabled && isCustomTemplate && project.status === ProjectStatus.Done;
  const templateImages = Array.isArray((project as any)?.templateImages)
    ? (project as any).templateImages
    : [];
  const canRecreateVideo = isCustomTemplate;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
            <Tooltip
              content={
                <div className="max-w-[240px]">
                  <div className="font-medium mb-0.5 text-white">{statusInfo[project.status as ProjectStatus]?.label ?? t.statusFallback}</div>
                  <div className="text-xs text-white/90">
                    {statusInfo[project.status as ProjectStatus]?.description ?? ''}
                  </div>
                </div>
              }
            >
              <div className="h-6 w-6 flex items-center justify-center cursor-help">
                <StatusIcon status={project.status} size={18} />
              </div>
          </Tooltip>
          <h1 className="text-xl leading-6 font-semibold truncate max-w-[70vw] sm:max-w-none">
            {project.title}
          </h1>
        </div>
        {/* Kebab menu (top-right) */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t.projectActions}
              title={t.projectActions}
              className="rounded-full"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(176px,calc(100vw-1rem))] p-1">
            <div
              role="menuitem"
              tabIndex={0}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer text-sm"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              <span>{t.delete}</span>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {project.status === ProjectStatus.Error && (
        <ProjectErrorCard message={(project.statusInfo as any)?.message as string | undefined} />
      )}
      <ProjectFinalVideoCard
        variants={languageVariants}
        primaryLanguage={primaryLanguage}
        projectStatus={project.status as ProjectStatus}
        fallbackUrl={finalVideoUrl}
        title={project.title}
        projectId={projectId}
        failedLanguages={failedVideoLanguages}
        videoLogs={videoLogMap}
        videoErrors={videoErrorsMap}
        canRecreate={canRecreateVideo}
      />
      {showImageEditor && (
        <ProjectImageEditorSection
          projectId={projectId}
          images={templateImages}
          projectStatus={project.status as ProjectStatus}
          canRecreateVideo={canRecreateVideo}
        />
      )}
      <SchedulerSection projectId={projectId} />
      {showScriptEditor && (
        <Card>
          <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-500" />
              {t.scriptApproval}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t.scriptApprovalDescription}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScriptEditor
              projectId={projectId}
              primaryLanguage={primaryLanguage}
              variants={languageVariants}
              fallbackText={(project.statusInfo as any)?.scriptText ?? project.finalScriptText ?? project.rawScript ?? ''}
            />
          </CardContent>
        </Card>
      )}
      {project.status === ProjectStatus.ProcessAudioValidate ? (
        <>
          <AudioApproval
            projectId={projectId}
            primaryLanguage={primaryLanguage}
            variants={languageVariants}
          />
          <ProjectPromptCard
            prompt={project.prompt}
            rawScript={project.rawScript}
            settings={<ProjectSettingsBar creation={project.creation} template={project.template} />}
          />
        </>
      ) : (
        <ProjectPromptCard
          prompt={project.prompt}
          rawScript={project.rawScript}
          settings={<ProjectSettingsBar creation={project.creation} template={project.template} />}
        />
      )}
      {showApprovedScript ? (
        <ProjectApprovedScriptCard
          projectId={projectId}
          canEdit={project.status === ProjectStatus.Done}
          title={project.title}
          primaryLanguage={primaryLanguage}
          variants={languageVariants}
          fallbackText={resolvedScriptText}
        />
      ) : null}
      {/* Approved audio preview below the script when available */}
      {showApprovedAudioSection ? (
        <ProjectApprovedAudioCard
          title={project.title}
          primaryLanguage={primaryLanguage}
          variants={languageVariants}
          fallbackUrl={
            project?.finalVoiceoverPath
              || (project?.statusInfo && (((project.statusInfo as any).finalVoiceoverPath) || ((project.statusInfo as any).approvedAudioPath)) ? ((project.statusInfo as any).finalVoiceoverPath || (project.statusInfo as any).approvedAudioPath) as string : null)
              || null
          }
        />
      ) : null}
      {project.status === ProjectStatus.ProcessAudioValidate && null}

      {/* Delete confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteProjectTitle}</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t.deleteProjectDescription}
          </DialogDescription>
          <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm leading-5">
              {t.deleteProjectWarning}
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">{t.cancel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  // Optimistically remove from sidebar via app-level event
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('project:deleted', { detail: { projectId } }));
                  }
                  // Fire deletion in parallel
                  await Api.deleteProject(projectId);
                  setConfirmOpen(false);
                  router.push('/');
                } catch (_) {
                  // If deletion fails, we could refresh to reconcile
                  setConfirmOpen(false);
                  router.refresh();
                }
              }}
            >
              {t.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
