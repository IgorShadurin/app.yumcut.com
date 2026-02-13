import path from 'path';
import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from '../logger';
import { getLanguageProgress, getTranscriptionSnapshot, setStatus, setFinalVideo, updateLanguageProgress, markLanguageFailure } from '../db';
import { buildFinalVideo } from '../video';
import { isDummyScriptWorkspace, writeDummyMainVideo, writeDummyMergedVideo } from '../dummy-fallbacks';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { determineEffectName, resolveProjectLanguagesFromSnapshot } from './project-utils';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir } from '../language-workspace';

type VideoMainPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  jobPayload: Record<string, unknown>;
  daemonConfig: DaemonConfig;
};

export async function handleVideoMainPhase({ projectId, cfg, jobPayload, daemonConfig }: VideoMainPhaseArgs) {
  const projectScaffold = await ensureProjectScaffold(projectId);
  const agentWorkspace = projectScaffold.workspaceRoot;
  const projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
  let primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
  let primaryInfo = await ensureLanguageWorkspace(projectId, primaryLanguage);
  const transcriptionSnapshot = await getTranscriptionSnapshot(projectId);
  const effectName = determineEffectName(projectId, cfg.template ?? null);
  const cfgIncludeDefaultMusic = typeof cfg.includeDefaultMusic === 'boolean' ? cfg.includeDefaultMusic : true;
  const cfgIncludeOverlay = typeof cfg.addOverlay === 'boolean' ? cfg.addOverlay : true;
  const includeDefaultMusic = typeof (jobPayload as any)?.includeDefaultMusic === 'boolean'
    ? (jobPayload as any).includeDefaultMusic
    : cfgIncludeDefaultMusic;
  const includeOverlay = typeof (jobPayload as any)?.addOverlay === 'boolean'
    ? (jobPayload as any).addOverlay
    : cfgIncludeOverlay;
  const audioLocalPaths = (jobPayload as any)?.audioLocalPaths as Record<string, string | null> | undefined;

  try {
    const progress = await getLanguageProgress(projectId);
    const disabledLanguages = new Set(progress.progress.filter((row) => row.disabled).map((row) => row.languageCode));
    const activeLanguages = projectLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      throw new Error('No active languages available for final video generation');
    }
    if (!activeLanguages.includes(primaryLanguage)) {
      primaryLanguage = activeLanguages[0] ?? primaryLanguage;
      primaryInfo = await ensureLanguageWorkspace(projectId, primaryLanguage);
    }
    const pendingLanguages = activeLanguages.filter((code) => {
      const entry = progress.progress.find((row) => row.languageCode === code);
      return !entry || !entry.finalVideoDone;
    });

    if (pendingLanguages.length === 0) {
      await setStatus(projectId, ProjectStatus.Done, 'Video ready', {
        videoWorkspace: primaryInfo.languageWorkspace,
        videoWorkspaceRoot: agentWorkspace,
        effectName,
        includeDefaultMusic,
        addOverlay: includeOverlay,
        watermarkEnabled: cfg.watermarkEnabled,
        completedLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
      });
      return;
    }

    const videoLogs: Record<string, string | null> = {};
    const finalVideoPaths: Record<string, string> = {};
    const overlaysByLanguage: Record<string, unknown> = {};
    const workspaceByLanguage: Record<string, string> = {};

    for (const languageCode of pendingLanguages) {
      try {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        try { await fs.rm(path.join(workspaceRoot, 'video-merge-layers'), { recursive: true, force: true }); } catch {}

        const metadataJsonPath = path.join(workspaceRoot, 'metadata', 'transcript-blocks.json');
        try {
          await fs.access(metadataJsonPath);
        } catch {
          throw new Error(`Metadata not found for language ${languageCode} at ${metadataJsonPath}`);
        }

        const mainVideoPath = path.join(workspaceRoot, 'video-basic-effects', 'final', 'simple.1080p.mp4');
        try {
          await fs.access(mainVideoPath);
        } catch {
          throw new Error(`Video parts not found for language ${languageCode} at ${mainVideoPath}`);
        }

        const overlayPath = path.join(workspaceRoot, 'captions-video', 'out-alpha-validated.webm');
        const captionsOverlayPath = cfg.captionsEnabled ? overlayPath : null;

        const voiceover = transcriptionSnapshot.finalVoiceovers?.[languageCode] ?? null;
        let audioLocalPath = audioLocalPaths?.[languageCode] ?? voiceover?.localPath ?? null;
        if (!audioLocalPath && languageCode === primaryLanguage) {
          audioLocalPath = transcriptionSnapshot.localPath;
        }
        if (!audioLocalPath) {
          throw new Error(`Voiceover audio not available locally for language ${languageCode}`);
        }
        try {
          await fs.access(audioLocalPath);
        } catch {
          throw new Error(`Voiceover audio not found at ${audioLocalPath} for language ${languageCode}`);
        }

        const videoResult = await buildFinalVideo({
          projectId,
          workspaceRoot,
          commandsWorkspaceRoot: agentWorkspace,
          logDir: await ensureLanguageLogDir(languageInfo, 'video'),
          scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
          metadataJsonPath,
          mainVideoPath,
          audioPath: audioLocalPath,
          captionsOverlayPath,
          includeDefaultMusic,
          addOverlay: includeOverlay,
          watermarkEnabled: cfg.watermarkEnabled,
          customOverlayPath: cfg.template?.overlay?.url ?? null,
          customMusicPath: cfg.template?.music?.url ?? null,
        });
        videoLogs[languageCode] = videoResult.logPath;
        overlaysByLanguage[languageCode] = videoResult.overlays;
        finalVideoPaths[languageCode] = videoResult.finalVideoPath;
        await setFinalVideo(projectId, videoResult.finalVideoPath, languageCode);
        try {
          await updateLanguageProgress(projectId, { languageCode, finalVideoDone: true });
        } catch (err: any) {
          log.warn('Failed to persist final video progress', {
            projectId,
            languageCode,
            error: err?.message || String(err),
          });
        }
      } catch (languageErr: any) {
        log.error('Final video rendering failed for language', {
          projectId,
          languageCode,
          error: languageErr?.message || String(languageErr),
        });
        delete finalVideoPaths[languageCode];
        await markLanguageFailure(projectId, languageCode, 'video_main', languageErr?.message || String(languageErr));
      }
    }

    const updatedProgress = await getLanguageProgress(projectId);
    const failedLanguageList = updatedProgress.progress.filter((row) => row.disabled).map((row) => row.languageCode);
    const activeProgress = updatedProgress.progress.filter((row) => !row.disabled);
    if (activeProgress.length === 0) {
      throw new Error('Final video rendering left no active languages');
    }
    const remaining = updatedProgress.aggregate.finalVideo.remaining;
    const completedLanguages = activeProgress.filter((row) => row.finalVideoDone).map((row) => row.languageCode);

    if (remaining.length > 0) {
      await setStatus(projectId, ProjectStatus.ProcessVideoMain, 'Final videos rendering in progress', {
        videoWorkspace: agentWorkspace,
        videoLogs,
        finalVideoPaths,
        effectName,
        includeDefaultMusic,
        addOverlay: includeOverlay,
        watermarkEnabled: cfg.watermarkEnabled,
        completedLanguages,
        pendingLanguages: remaining,
        overlays: overlaysByLanguage,
        videoWorkspaceRoot: agentWorkspace,
        videoWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    } else {
      await setStatus(projectId, ProjectStatus.Done, 'Video ready', {
        videoWorkspace: agentWorkspace,
        videoLogs,
        finalVideoPaths,
        effectName,
        includeDefaultMusic,
        addOverlay: includeOverlay,
        watermarkEnabled: cfg.watermarkEnabled,
        overlays: overlaysByLanguage,
        videoWorkspaceRoot: agentWorkspace,
        videoWorkspacesByLanguage: workspaceByLanguage,
        completedLanguages,
        failedLanguages: failedLanguageList,
      });
    }
  } catch (err: any) {
    const isDummyWorkspace = isDummyScriptWorkspace(daemonConfig.scriptWorkspaceV2);
    if (isDummyWorkspace) {
      const projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
      const progressFallback = await getLanguageProgress(projectId).catch(() => null);
      const disabledFallback = new Set((progressFallback?.progress ?? []).filter((row) => row.disabled).map((row) => row.languageCode));
      const activeFallbackLanguages = projectLanguages.filter((code) => !disabledFallback.has(code));
      if (activeFallbackLanguages.length === 0) {
        log.warn('Dummy fallback has no active languages; skipping finalization', { projectId });
        throw err;
      }
      const videoLogs: Record<string, string | null> = {};
      const finalVideoPaths: Record<string, string> = {};
      const overlaysByLanguage: Record<string, unknown> = {};
      const workspaceByLanguage: Record<string, string> = {};

      for (const languageCode of activeFallbackLanguages) {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const fallbackMain = await writeDummyMainVideo(workspaceRoot);
        const fallbackFinal = await writeDummyMergedVideo(workspaceRoot);
        const chosenPath = fallbackFinal || fallbackMain;
        videoLogs[languageCode] = null;
        finalVideoPaths[languageCode] = chosenPath;
        overlaysByLanguage[languageCode] = [];
        try {
          await setFinalVideo(projectId, chosenPath, languageCode);
        } catch (assetErr: any) {
          log.warn('Failed to register fallback final video', {
            projectId,
            languageCode,
            error: assetErr?.message || String(assetErr),
          });
        }
        try {
          await updateLanguageProgress(projectId, {
            languageCode,
            finalVideoDone: true,
            videoPartsDone: true,
          });
        } catch (updateErr: any) {
          log.warn('Failed to persist final video progress in fallback', {
            projectId,
            languageCode,
            error: updateErr?.message || String(updateErr),
          });
        }
      }

      const fallbackPrimaryWorkspace = workspaceByLanguage[primaryLanguage] ?? primaryInfo.languageWorkspace ?? agentWorkspace;

      await setStatus(projectId, ProjectStatus.Done, 'Video ready', {
        videoWorkspace: fallbackPrimaryWorkspace,
        videoLogs,
        finalVideoPaths,
        effectName,
        includeDefaultMusic: cfgIncludeDefaultMusic,
        addOverlay: cfgIncludeOverlay,
        watermarkEnabled: cfg.watermarkEnabled,
        overlays: overlaysByLanguage,
        completedLanguages: activeFallbackLanguages,
        failedLanguages: Array.from(disabledFallback),
        videoWorkspaceRoot: agentWorkspace,
        videoWorkspacesByLanguage: workspaceByLanguage,
      });
      log.warn('Final video placeholder applied after failure in test workspace', {
        projectId,
        error: err?.message || String(err),
      });
      return;
    }
    log.error('Final video generation failed', {
      projectId,
      error: err?.message || String(err),
    });
    await setStatus(projectId, ProjectStatus.Error, 'Final video compilation failed');
    throw createHandledError('Final video compilation failed', err);
  }
}
