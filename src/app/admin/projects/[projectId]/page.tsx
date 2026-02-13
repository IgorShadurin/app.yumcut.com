import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getProjectDetailForAdmin } from '@/server/admin/projects';
import { ProjectPromptCard } from '@/components/project/ProjectPromptCard';
import { ProjectSettingsBar } from '@/components/project/ProjectSettingsBar';
import { ProjectApprovedScriptCard } from '@/components/project/ProjectApprovedScriptCard';
import { ProjectApprovedAudioCard } from '@/components/project/ProjectApprovedAudioCard';
import { ProjectFinalVideoCard } from '@/components/project/ProjectFinalVideoCard';
import { ProjectErrorCard } from '@/components/project/ProjectErrorCard';
import { ProjectStatus } from '@/shared/constants/status';
import { statusLabel, statusDescription as describeStatus } from '@/shared/constants/status-info';
import { formatDateTimeAdmin } from '@/lib/date';
import Link from 'next/link';
import { AdminBackButton } from '@/components/admin/AdminBackButton';
import { AdminProjectStatusChanger } from '@/components/admin/AdminProjectStatusChanger';
import type { ProjectLanguageProgressStateDTO } from '@/shared/types';

function formatStatus(status: ProjectStatus) { return statusLabel(status); }

export default async function AdminProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const detail = await getProjectDetailForAdmin(projectId);
  if (!detail) {
    notFound();
  }

  const { project, user, latestLogMessage, languageProgress } = detail;
  const statusInfo = project.statusInfo as Record<string, unknown> | undefined;
  const statusLabel = formatStatus(project.status);
  const statusDescription = describeStatus(project.status);
  const languageVariants = project.languageVariants ?? [];
  const primaryLanguage = languageVariants.find((variant) => variant.isPrimary)?.languageCode
    ?? project.creation?.targetLanguage
    ?? project.languages?.[0]
    ?? 'en';
  const scriptFallback = project.finalScriptText
    || (typeof statusInfo?.scriptText === 'string' ? (statusInfo.scriptText as string) : null)
    || project.rawScript
    || null;
  const errorMessage = project.status === ProjectStatus.Error
    ? ((statusInfo?.message as string | undefined) ?? latestLogMessage ?? undefined)
    : undefined;
  const fallbackFinalVideo = project.finalVideoUrl ?? project.finalVideoPath ?? null;
  const failedVideoLanguages = Array.isArray(statusInfo?.failedLanguages)
    ? (statusInfo?.failedLanguages as Array<string | null | undefined>).filter(Boolean).map(String)
    : [];
  const videoLogs = statusInfo?.videoLogs && typeof statusInfo.videoLogs === 'object'
    ? statusInfo.videoLogs as Record<string, string | null | undefined>
    : undefined;
  const videoErrors = statusInfo?.videoErrors && typeof statusInfo.videoErrors === 'object'
    ? statusInfo.videoErrors as Record<string, string | null | undefined>
    : undefined;

  const progressMap = new Map((languageProgress ?? []).map((row) => [row.languageCode, row]));
  const selectableLanguages: ProjectLanguageProgressStateDTO[] = Array.from(new Set([
    ...(project.languages ?? []),
    ...languageVariants.map((variant) => variant.languageCode),
    ...(languageProgress ?? []).map((row) => row.languageCode),
  ]))
    .filter((code): code is string => typeof code === 'string' && code.length > 0)
    .map((languageCode) => progressMap.get(languageCode) ?? {
      languageCode,
      transcriptionDone: false,
      captionsDone: false,
      videoPartsDone: false,
      finalVideoDone: false,
      disabled: false,
      failedStep: null,
      failureReason: null,
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Created {formatDateTimeAdmin(project.createdAt)}
            <span className="mx-1">•</span>
            Updated {formatDateTimeAdmin(project.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{statusLabel}</Badge>
          <Link
            href={`/admin/users/${user.id}`}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {user.name || user.email}
          </Link>
        </div>
      </div>
      <AdminBackButton className="w-fit" />

      {/* Admin-only status changer below the back button */}
      <AdminProjectStatusChanger projectId={project.id} current={project.status} languages={selectableLanguages} />

      {statusDescription ? (
        <Card>
          <CardContent className="text-sm text-gray-600 dark:text-gray-300">
            {statusDescription}
          </CardContent>
        </Card>
      ) : null}

      {errorMessage ? <ProjectErrorCard message={errorMessage} /> : null}
      <ProjectFinalVideoCard
        variants={languageVariants}
        primaryLanguage={primaryLanguage}
        projectStatus={project.status}
        fallbackUrl={fallbackFinalVideo}
        title={project.title}
        projectId={project.id}
        failedLanguages={failedVideoLanguages}
        videoLogs={videoLogs}
        videoErrors={videoErrors}
      />

      <ProjectPromptCard
        prompt={project.prompt}
        rawScript={project.rawScript}
        settings={project.creation ? <ProjectSettingsBar creation={project.creation} /> : undefined}
      />

      <ProjectApprovedScriptCard
        variants={languageVariants}
        primaryLanguage={primaryLanguage}
        fallbackText={scriptFallback}
        title={project.title}
      />

      <ProjectApprovedAudioCard
        variants={languageVariants}
        primaryLanguage={primaryLanguage}
        fallbackUrl={project.finalVoiceoverPath}
        title={project.title}
      />
    </div>
  );
}
