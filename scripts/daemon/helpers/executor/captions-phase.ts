import path from 'path';
import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from '../logger';
import { getLanguageProgress, setStatus, updateLanguageProgress, markLanguageFailure } from '../db';
import { generateCaptionsOverlay } from '../captions';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { resolveProjectLanguagesFromSnapshot } from './project-utils';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir } from '../language-workspace';

type CaptionsPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  daemonConfig: DaemonConfig;
};

export async function handleCaptionsPhase({ projectId, cfg, daemonConfig }: CaptionsPhaseArgs) {
  const projectScaffold = await ensureProjectScaffold(projectId);
  const agentWorkspace = projectScaffold.workspaceRoot;

  try {
    const projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
    const primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
    const progress = await getLanguageProgress(projectId);
    const disabledLanguages = new Set(progress.progress.filter((row) => row.disabled).map((row) => row.languageCode));
    const activeLanguages = projectLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      throw new Error('No active languages available for captions generation');
    }
    const pendingLanguages = projectLanguages.filter((code) => {
      if (disabledLanguages.has(code)) return false;
      const entry = progress.progress.find((row) => row.languageCode === code);
      return !entry || !entry.captionsDone;
    });
    if (pendingLanguages.length === 0) {
      await setStatus(projectId, ProjectStatus.ProcessImagesGeneration, 'Captions overlay generated', {
        captionsWorkspace: agentWorkspace,
        captionsLanguages: activeLanguages,
        failedLanguages: Array.from(disabledLanguages),
      });
      return;
    }

    const templateCaptionPreset = cfg.template?.captionsStyle?.externalId?.trim();
    const captionPreset = templateCaptionPreset || 'acid';
    if (!templateCaptionPreset && cfg.template) {
      log.warn('⚠️ Template missing captions preset; using Acid default', {
        projectId,
        templateId: cfg.template.id,
        templateCode: cfg.template.code,
      });
    }

    const captionLogs: Record<string, string | null> = {};
    const workspaceByLanguage: Record<string, string> = {};

    for (const languageCode of pendingLanguages) {
      try {
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const metadataJsonPath = path.join(workspaceRoot, 'metadata', 'transcript-blocks.json');
        try {
          await fs.access(metadataJsonPath);
        } catch {
          throw new Error(`Metadata not found for language ${languageCode} at ${metadataJsonPath}`);
        }
        const result = await generateCaptionsOverlay({
          projectId,
          workspaceRoot,
          commandsWorkspaceRoot: languageInfo.workspaceRoot,
          logDir: await ensureLanguageLogDir(languageInfo, 'captions'),
          scriptCaptionWorkspace: daemonConfig.scriptCaptionWorkspace,
          inputJsonPath: metadataJsonPath,
          preset: captionPreset,
          renderer: daemonConfig.captionsRenderer,
        });
        captionLogs[languageCode] = result.logPath;
        try {
          await updateLanguageProgress(projectId, { languageCode, captionsDone: true });
        } catch (err: any) {
          log.warn('Failed to persist captions progress', {
            projectId,
            languageCode,
            error: err?.message || String(err),
          });
        }
      } catch (languageErr: any) {
        captionLogs[languageCode] = null;
        log.error('Captions overlay generation failed for language', {
          projectId,
          languageCode,
          error: languageErr?.message || String(languageErr),
        });
        await markLanguageFailure(projectId, languageCode, 'captions', languageErr?.message || String(languageErr));
      }
    }

    const updatedProgress = await getLanguageProgress(projectId);
    const failedLanguageList = updatedProgress.progress.filter((row) => row.disabled).map((row) => row.languageCode);
    const activeProgress = updatedProgress.progress.filter((row) => !row.disabled);
    if (activeProgress.length === 0) {
      throw new Error('Captions generation left no active languages');
    }
    const remaining = updatedProgress.aggregate.captions.remaining;
    if (remaining.length > 0) {
      await setStatus(projectId, ProjectStatus.ProcessCaptionsVideo, 'Captions overlay generation in progress', {
        captionsWorkspace: agentWorkspace,
        captionsLogs: captionLogs,
        completedLanguages: activeProgress.filter((row) => row.captionsDone).map((row) => row.languageCode),
        pendingLanguages: remaining,
        captionsWorkspaceRoot: agentWorkspace,
        captionsWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    } else {
      await setStatus(projectId, ProjectStatus.ProcessImagesGeneration, 'Captions overlay generated', {
        captionsWorkspace: agentWorkspace,
        captionsLogs: captionLogs,
        captionsLanguages: activeProgress.map((row) => row.languageCode),
        captionsWorkspaceRoot: agentWorkspace,
        captionsWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
    }
  } catch (err: any) {
    log.error('Captions overlay generation failed', {
      projectId,
      error: err?.message || String(err),
    });
    await setStatus(projectId, ProjectStatus.Error, 'Captions overlay generation failed');
    throw createHandledError('Captions overlay generation failed', err);
  }
}
