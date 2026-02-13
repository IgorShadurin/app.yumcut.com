import path from 'path';
import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from '../logger';
import { getLanguageProgress, setStatus, updateLanguageProgress, markLanguageFailure } from '../db';
import { renderVideoParts } from '../video';
import { isDummyScriptWorkspace, writeDummyMainVideo, writeDummyMergedVideo } from '../dummy-fallbacks';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { determineEffectName, resolveProjectLanguagesFromSnapshot } from './project-utils';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir, ensureTemplateWorkspace } from '../language-workspace';
import { isCustomTemplateData } from '@/shared/templates/custom-data';
import { refreshTemplateImagesFromStorage } from '../template-images';

type VideoPartsPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  jobPayload: Record<string, unknown>;
  daemonConfig: DaemonConfig;
};

export async function handleVideoPartsPhase({ projectId, cfg, jobPayload, daemonConfig }: VideoPartsPhaseArgs) {
  const projectScaffold = await ensureProjectScaffold(projectId);
  const agentWorkspace = projectScaffold.workspaceRoot;
  const videoPartsLogs: Record<string, string | null> = {};
  const mainVideoPaths: Record<string, string | null> = {};
  const workspaceByLanguage: Record<string, string> = {};
  const customTemplate = isCustomTemplateData(cfg.template?.customData);
  const templateWorkspace = customTemplate
    ? await ensureTemplateWorkspace(projectId, cfg.template?.code ?? null, cfg.template?.id ?? null).catch(() => null)
    : null;
  const recreateVideo = Boolean((jobPayload as any)?.recreateVideo || (jobPayload as any)?.reason === 'video_recreate');
  let projectLanguages: string[] = [];
  let pendingLanguages: string[] = [];
  let effectName: string | null = null;
  let includeCallToAction = true;
  let voiceExternalId: string | null = null;
  let lastAttempt: {
    languageCode: string | null;
    workspaceRoot: string | null;
    metadataJsonPath: string | null;
    logDir: string | null;
  } = { languageCode: null, workspaceRoot: null, metadataJsonPath: null, logDir: null };
  let lastAttemptLogPath: string | null = null;
  let lastAttemptCommand: string | null = null;

  try {
    projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
    const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
    const primaryInfo = await ensureLanguageWorkspace(projectId, primaryLanguage);
    const progress = await getLanguageProgress(projectId);
    const disabledLanguages = new Set(progress.progress.filter((row) => row.disabled).map((row) => row.languageCode));
    const activeLanguages = projectLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      throw new Error('No active languages available for video parts generation');
    }
    pendingLanguages = projectLanguages.filter((code) => {
      if (disabledLanguages.has(code)) return false;
      const entry = progress.progress.find((row) => row.languageCode === code);
      return !entry || !entry.videoPartsDone;
    });

    if (pendingLanguages.length === 0) {
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: primaryInfo.languageWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        effectName: determineEffectName(projectId, cfg.template ?? null),
        completedLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
      });
      return;
    }

    effectName = determineEffectName(projectId, cfg.template ?? null);
    includeCallToAction = (cfg as any).includeCallToAction ?? true;
    voiceExternalId = (cfg as any).voiceId ?? null;
    if (customTemplate && recreateVideo && templateWorkspace) {
      await refreshTemplateImagesFromStorage({
        projectId,
        templateWorkspace: templateWorkspace.templateWorkspace,
        templateImages: (cfg as any).templateImages ?? [],
      });
    }

    const sharedImagesDir = await (async () => {
      const candidates = [
        path.join(agentWorkspace, 'template-images'),
        templateWorkspace ? path.join(templateWorkspace.templateWorkspace, 'images') : null,
        path.join(agentWorkspace, 'qwen-image-edit', 'prepared'),
        path.join(agentWorkspace, 'prepared'),
        path.join(agentWorkspace, 'images'),
        path.join(agentWorkspace, 'comics-vertical', 'prepared'),
        path.join(agentWorkspace, 'comics-vertical', 'images'),
        path.join(primaryInfo.languageWorkspace, 'qwen-image-edit', 'prepared'),
        path.join(primaryInfo.languageWorkspace, 'comics-vertical', 'prepared'),
        path.join(primaryInfo.languageWorkspace, 'comics-vertical', 'images'),
        path.join(primaryInfo.languageWorkspace, 'images'),
      ];
      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          const stat = await fs.stat(candidate);
          if (stat.isDirectory()) return candidate;
        } catch {
          // ignore missing candidate
        }
      }
      return null;
    })();
    if (recreateVideo) {
      for (const languageCode of pendingLanguages) {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        const effectDir = path.join(workspaceRoot, 'video-basic-effects');
        const mergeDir = path.join(workspaceRoot, 'video-merge-layers');
        try { await fs.rm(effectDir, { recursive: true, force: true }); } catch {}
        try { await fs.rm(mergeDir, { recursive: true, force: true }); } catch {}
      }
    }
    for (const languageCode of pendingLanguages) {
      try {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const metadataDir = path.join(workspaceRoot, 'metadata');
        const sentenceMetadataPath = path.join(metadataDir, 'transcript-sentences.json');
        const legacyMetadataPath = path.join(metadataDir, 'transcript-blocks.json');
        const metadataJsonPath = await pickMetadataPath({
          preferSentence: customTemplate,
          sentencePath: sentenceMetadataPath,
          legacyPath: legacyMetadataPath,
          languageCode,
        });

        const logDir = await ensureLanguageLogDir(languageInfo, 'video-parts');
        lastAttempt = {
          languageCode,
          workspaceRoot,
          metadataJsonPath,
          logDir,
        };
        lastAttemptLogPath = null;
        lastAttemptCommand = null;

        const partsResult = await renderVideoParts({
          projectId,
          workspaceRoot,
          commandsWorkspaceRoot: agentWorkspace,
          logDir,
          scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
          metadataJsonPath,
          effectName,
          includeCallToAction,
          targetLanguage: languageCode,
          voiceExternalId,
          imagesDir: sharedImagesDir ?? undefined,
          clean: true,
          scriptMode: daemonConfig.scriptMode,
          isTemplateV2: customTemplate,
        });
        videoPartsLogs[languageCode] = partsResult.logPath;
        mainVideoPaths[languageCode] = partsResult.mainVideoPath;
        lastAttemptLogPath = partsResult.logPath ?? null;
        lastAttemptCommand = partsResult.command ?? null;
        try {
          await updateLanguageProgress(projectId, { languageCode, videoPartsDone: true });
        } catch (err: any) {
          log.warn('Failed to persist video parts progress', {
            projectId,
            languageCode,
            error: err?.message || String(err),
          });
        }
      } catch (languageErr: any) {
        const logPathFromError = typeof languageErr?.logPath === 'string' ? languageErr.logPath : null;
        const commandFromError = typeof languageErr?.command === 'string' ? languageErr.command : null;
        log.error('Video parts rendering failed for language', {
          projectId,
          languageCode,
          error: languageErr?.message || String(languageErr),
          metadataJsonPath: lastAttempt.metadataJsonPath,
          workspace: lastAttempt.workspaceRoot,
          logDir: lastAttempt.logDir,
          logPath: logPathFromError ?? lastAttemptLogPath ?? null,
          command: commandFromError ?? lastAttemptCommand ?? null,
        });
        videoPartsLogs[languageCode] = logPathFromError ?? null;
        delete mainVideoPaths[languageCode];
        await markLanguageFailure(projectId, languageCode, 'video_parts', languageErr?.message || String(languageErr));
      }
    }

    const updatedProgress = await getLanguageProgress(projectId);
    const failedLanguageList = updatedProgress.progress.filter((row) => row.disabled).map((row) => row.languageCode);
    const activeProgress = updatedProgress.progress.filter((row) => !row.disabled);
    if (activeProgress.length === 0) {
      throw new Error('Video parts generation left no active languages');
    }
    const remaining = updatedProgress.aggregate.videoParts.remaining;
    const completedLanguages = activeProgress.filter((row) => row.videoPartsDone).map((row) => row.languageCode);
    if (remaining.length > 0) {
      await setStatus(projectId, ProjectStatus.ProcessVideoPartsGeneration, 'Video parts rendering in progress', {
        videoPartsWorkspace: primaryInfo.languageWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName,
        completedLanguages,
        pendingLanguages: remaining,
        videoPartsWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    } else {
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: primaryInfo.languageWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName,
        completedLanguages,
        videoPartsWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    }
  } catch (err: any) {
    const isDummyWorkspace = isDummyScriptWorkspace(daemonConfig.scriptWorkspaceV2);
    if (isDummyWorkspace) {
      const fallbackLanguages = projectLanguages.length > 0 ? projectLanguages : resolveProjectLanguagesFromSnapshot(cfg);
      const primaryLanguage = fallbackLanguages[0] ?? DEFAULT_LANGUAGE;
      const fallbackEffect = determineEffectName(projectId, cfg.template ?? null);
      const videoPartsLogs: Record<string, string | null> = {};
      const mainVideoPaths: Record<string, string> = {};
      const workspaceByLanguage: Record<string, string> = {};

      for (const languageCode of fallbackLanguages) {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const fallbackFile = await writeDummyMainVideo(workspaceRoot);
        await writeDummyMergedVideo(workspaceRoot);
        videoPartsLogs[languageCode] = null;
        mainVideoPaths[languageCode] = fallbackFile;
        try {
          await updateLanguageProgress(projectId, { languageCode, videoPartsDone: true });
        } catch (updateErr: any) {
          log.warn('Failed to persist video parts progress in fallback', {
            projectId,
            languageCode,
            error: updateErr?.message || String(updateErr),
          });
        }
      }

      log.warn('Video parts placeholder applied after failure in test workspace', {
        projectId,
        error: err?.message || String(err),
      });
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Video parts rendered', {
        videoPartsWorkspace: primaryLanguage ? (await ensureLanguageWorkspace(projectId, primaryLanguage)).languageWorkspace : agentWorkspace,
        videoPartsWorkspaceRoot: agentWorkspace,
        videoPartsLogs,
        mainVideoPaths,
        effectName: fallbackEffect,
        completedLanguages: fallbackLanguages,
        pendingLanguages: [],
        videoPartsWorkspacesByLanguage: workspaceByLanguage,
      });
      return;
    }
    const failedLanguage = lastAttempt.languageCode ?? null;
    const logPathFromError = typeof err?.logPath === 'string' ? err.logPath : null;
    const commandFromError = typeof err?.command === 'string' ? err.command : null;
    const completedLanguages = Object.entries(mainVideoPaths)
      .filter(([, value]) => Boolean(value))
      .map(([code]) => code);

    log.error('Video parts rendering failed', {
      projectId,
      error: err?.message || String(err),
      failedLanguage,
      metadataJsonPath: lastAttempt.metadataJsonPath,
      workspace: lastAttempt.workspaceRoot,
      logDir: lastAttempt.logDir,
      logPath: logPathFromError ?? lastAttemptLogPath ?? (failedLanguage ? videoPartsLogs[failedLanguage] ?? null : null),
      command: commandFromError ?? lastAttemptCommand,
      pendingLanguages,
      completedLanguages,
        effectName,
      includeCallToAction,
      voiceExternalId,
    });
    await setStatus(projectId, ProjectStatus.Error, 'Video parts rendering failed', {
      failedLanguage,
      logPath: logPathFromError ?? lastAttemptLogPath ?? null,
      command: commandFromError ?? lastAttemptCommand ?? null,
      metadataJsonPath: lastAttempt.metadataJsonPath ?? null,
      workspace: lastAttempt.workspaceRoot ?? null,
      logDir: lastAttempt.logDir ?? null,
      pendingLanguages,
      completedLanguages,
    });
    throw createHandledError('Video parts rendering failed', err);
  }
}

async function pickMetadataPath(params: {
  preferSentence: boolean;
  sentencePath: string;
  legacyPath: string;
  languageCode: string;
}): Promise<string> {
  const { preferSentence, sentencePath, legacyPath, languageCode } = params;
  if (preferSentence) {
    try {
      await fs.access(sentencePath);
      return sentencePath;
    } catch {
      throw new Error(`Sentence metadata missing for ${languageCode} at ${sentencePath}`);
    }
  }
  try {
    await fs.access(legacyPath);
    return legacyPath;
  } catch {
    throw new Error(`Metadata file missing for ${languageCode} at ${legacyPath}`);
  }
}
