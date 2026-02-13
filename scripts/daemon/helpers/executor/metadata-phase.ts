import path from 'path';
import { readFile } from 'fs/promises';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from '../logger';
import { getLanguageProgress, setStatus, updateLanguageProgress, markLanguageFailure } from '../db';
import { generateMetadata } from '../metadata';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { createHandledError } from './error';
import { resolveProjectLanguagesFromSnapshot } from './project-utils';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir } from '../language-workspace';

type MetadataPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  daemonConfig: DaemonConfig;
};

export async function handleMetadataPhase({ projectId, cfg, daemonConfig }: MetadataPhaseArgs) {
  async function readBlockCountSafe(filePath: string, languageCode: string | null): Promise<number | null> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.blocks)) {
        return data.blocks.length;
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        log.warn('Failed to read transcript block count', {
          projectId,
          languageCode,
          filePath,
          error: err?.message || String(err),
        });
      }
    }
    return null;
  }

  const projectLanguages = resolveProjectLanguagesFromSnapshot(cfg);
  let primaryLanguage = projectLanguages[0] ?? DEFAULT_LANGUAGE;
  const captionsEnabled = cfg.captionsEnabled;
  let currentStep = 'initialize-metadata-phase';
  let currentLanguage: string | null = null;

  try {
    currentStep = 'ensure-project-scaffold';
    const projectScaffold = await ensureProjectScaffold(projectId);
    const agentWorkspace = projectScaffold.workspaceRoot;

    currentStep = 'load-language-progress';
    const progress = await getLanguageProgress(projectId);
    const disabledLanguages = new Set(progress.progress.filter((row) => row.disabled).map((row) => row.languageCode));
    const activeLanguages = projectLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      throw new Error('No active languages available for metadata generation');
    }
    primaryLanguage = activeLanguages[0] ?? primaryLanguage;
    const pendingLanguages = projectLanguages.filter((code) => {
      if (disabledLanguages.has(code)) return false;
      const entry = progress.progress.find((row) => row.languageCode === code);
      return !entry || !entry.captionsDone;
    });
    const languagesToProcess = pendingLanguages.length > 0 ? pendingLanguages : activeLanguages;
    const metadataLogs: Record<string, string | null> = {};
    const workspaceByLanguage: Record<string, string> = {};
    const primaryMetadataPath = path.join(agentWorkspace, primaryLanguage, 'metadata', 'transcript-blocks.json');
    currentStep = 'read-primary-metadata-count';
    let baseBlockCount = await readBlockCountSafe(primaryMetadataPath, primaryLanguage);
    const successfulLanguages: string[] = [];

    for (const languageCode of languagesToProcess) {
      currentLanguage = languageCode;
      if (disabledLanguages.has(languageCode)) {
        continue;
      }
      try {
        currentStep = 'ensure-language-workspace';
        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const workspaceRoot = languageInfo.languageWorkspace;
        workspaceByLanguage[languageCode] = workspaceRoot;
        const isPrimary = languageCode === primaryLanguage;
        const targetBlockCount = !isPrimary && typeof baseBlockCount === 'number' && baseBlockCount > 0 ? baseBlockCount : undefined;
        currentStep = 'ensure-language-log-dir';
        const logDir = await ensureLanguageLogDir(languageInfo, 'metadata');

        currentStep = 'check-existing-metadata';
        const existingBlockCount = await readBlockCountSafe(path.join(workspaceRoot, 'metadata', 'transcript-blocks.json'), languageCode);
        if (existingBlockCount && existingBlockCount > 0) {
          metadataLogs[languageCode] = null;
          successfulLanguages.push(languageCode);
          if (existingBlockCount && (baseBlockCount == null || isPrimary)) {
            baseBlockCount = existingBlockCount;
          }
          continue;
        }

        currentStep = 'generate-language-metadata';
        const metadataResult = await generateMetadata({
          projectId,
          workspaceRoot,
          commandsWorkspaceRoot: languageInfo.workspaceRoot,
          scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
          logDir,
          targetBlockCount,
          scriptMode: daemonConfig.scriptMode,
        });
        metadataLogs[languageCode] = metadataResult.logPath;
        successfulLanguages.push(languageCode);

        currentStep = 'read-generated-block-count';
        const producedBlockCount = await readBlockCountSafe(metadataResult.outputPath, languageCode);
        if (producedBlockCount && producedBlockCount > 0 && (baseBlockCount == null || isPrimary)) {
          baseBlockCount = producedBlockCount;
        }
        currentLanguage = null;
      } catch (languageErr: any) {
        metadataLogs[languageCode] = null;
        log.error('Metadata generation failed for language', {
          projectId,
          languageCode,
          error: languageErr?.message || String(languageErr),
        });
        await markLanguageFailure(projectId, languageCode, 'metadata', languageErr?.message || String(languageErr));
      }
    }

    const updatedProgress = await getLanguageProgress(projectId);
    const failedLanguageList = updatedProgress.progress.filter((row) => row.disabled).map((row) => row.languageCode);
    const activeProgress = updatedProgress.progress.filter((row) => !row.disabled);
    if (activeProgress.length === 0) {
      throw new Error('Metadata generation left no active languages');
    }

    if (!captionsEnabled) {
      currentStep = 'mark-captions-complete';
      await Promise.all(
        successfulLanguages.map((languageCode) =>
          updateLanguageProgress(projectId, { languageCode, captionsDone: true }).catch((updateErr) => {
            currentLanguage = languageCode;
            throw updateErr;
          }),
        ),
      );
      currentLanguage = null;
      currentStep = 'set-status-metadata-generated';
      await setStatus(projectId, ProjectStatus.ProcessImagesGeneration, 'Metadata generated', {
        metadataLogs,
        metadataLanguages: activeProgress.map((row) => row.languageCode),
        captionsEnabled: false,
        metadataWorkspaceRoot: agentWorkspace,
        metadataWorkspacesByLanguage: workspaceByLanguage,
        failedLanguages: failedLanguageList,
      });
      return;
    }

    const remainingCaptions = updatedProgress.aggregate.captions.remaining;
    currentStep = 'set-status-metadata-generated-captions';
    await setStatus(projectId, ProjectStatus.ProcessCaptionsVideo, 'Metadata generated; generating captions overlay', {
      metadataLogs,
      metadataLanguages: activeProgress.map((row) => row.languageCode),
      pendingLanguages: remainingCaptions,
      metadataWorkspaceRoot: agentWorkspace,
      metadataWorkspacesByLanguage: workspaceByLanguage,
      failedLanguages: failedLanguageList,
    });
  } catch (err: any) {
    log.error('Metadata phase failed', {
      projectId,
      step: currentStep,
      languageCode: currentLanguage,
      error: err?.message || String(err),
    });
    await setStatus(projectId, ProjectStatus.Error, 'Metadata generation failed', {
      failedStep: currentStep,
      failedLanguage: currentLanguage,
    });
    throw createHandledError('Metadata generation failed', err);
  }
}
