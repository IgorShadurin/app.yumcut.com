import { promises as fs } from 'fs';
import { ProjectStatus } from '@/shared/constants/status';
import { DEFAULT_LANGUAGE } from '@/shared/constants/languages';
import { log } from '../logger';
import { getTranscriptionSnapshot, getLanguageProgress, updateLanguageProgress, setStatus, markLanguageFailure } from '../db';
import { transcribeAudio } from '../transcription';
import type { DaemonConfig } from '../config';
import type { CreationSnapshot } from './types';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace, ensureLanguageLogDir } from '../language-workspace';
import { generateSentenceMetadata } from '../metadata';
import { isCustomTemplateData } from '@/shared/templates/custom-data';
import { readTemplateOriginalPath } from '../template-original';

type TranscriptionPhaseArgs = {
  projectId: string;
  jobPayload: Record<string, unknown>;
  cfg: CreationSnapshot;
  daemonConfig: DaemonConfig;
};

export async function handleTranscriptionPhase({ projectId, jobPayload, cfg, daemonConfig }: TranscriptionPhaseArgs) {
  try {
    const snapshot = await getTranscriptionSnapshot(projectId);
    const languagesFromConfig = Array.isArray((cfg as any).languages)
      ? ((cfg as any).languages as string[]).map((code) => code.toLowerCase())
      : [cfg.targetLanguage?.toLowerCase() ?? DEFAULT_LANGUAGE];
    const requestedLanguage = typeof jobPayload.languageCode === 'string' ? jobPayload.languageCode.trim().toLowerCase() : null;
    const languagesToConsider = requestedLanguage ? [requestedLanguage] : languagesFromConfig;
    const finalVoiceovers = snapshot.finalVoiceovers || {};

    const projectScaffold = await ensureProjectScaffold(projectId);
    const agentWorkspace = projectScaffold.workspaceRoot;

    const progress = await getLanguageProgress(projectId);
    const disabledLanguages = new Set(progress.progress.filter((row) => row.disabled).map((row) => row.languageCode));
    const completedLanguages = new Set(
      progress.progress
        .filter((row) => row.transcriptionDone && !row.disabled)
        .map((row) => row.languageCode),
    );
    const activeLanguages = languagesFromConfig.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      log.error('Transcription phase has no active languages remaining', { projectId });
      throw new Error('No active languages available for transcription');
    }
    const languagesToProcess = languagesToConsider.filter((code) => !disabledLanguages.has(code) && !completedLanguages.has(code));
    if (languagesToProcess.length === 0) {
      log.info('Transcription already completed for requested languages', { projectId, requestedLanguage });
      return;
    }

    const transcriptLogs: Record<string, string | null> = {};
    const workspaceByLanguage: Record<string, string> = {};
    const audioLocalPathsPayload = (typeof jobPayload.audioLocalPaths === 'object' ? jobPayload.audioLocalPaths : null) as Record<string, string | null> | null;
    const shouldGenerateSentenceMetadata = isCustomTemplateData(cfg.template?.customData);

    for (const languageCode of languagesToProcess) {
      try {
        const record = finalVoiceovers[languageCode];
        const candidateLocal = (audioLocalPathsPayload && audioLocalPathsPayload[languageCode]) || record?.localPath || snapshot.localPath;
        if (!candidateLocal) {
          throw new Error(`Voiceover audio not available locally for language ${languageCode}`);
        }
        try {
          await fs.access(candidateLocal);
        } catch {
          throw new Error(`Voiceover audio not found at ${candidateLocal} for language ${languageCode}`);
        }

        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        workspaceByLanguage[languageCode] = languageInfo.languageWorkspace;
        const logDir = await ensureLanguageLogDir(languageInfo, 'transcription');

        const transcriptionResult = await transcribeAudio({
          projectId,
          audioPath: candidateLocal,
          workspaceRoot: languageInfo.languageWorkspace,
          commandsWorkspaceRoot: languageInfo.workspaceRoot,
          logDir,
          scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
          languageCode,
        });
        transcriptLogs[languageCode] = transcriptionResult.logPath;

        if (shouldGenerateSentenceMetadata) {
          await maybeGenerateTemplateSentenceMetadata({
            projectId,
            languageInfo,
            scriptWorkspaceV2: daemonConfig.scriptWorkspaceV2,
          });
        }

        try {
          await updateLanguageProgress(projectId, {
            languageCode,
            transcriptionDone: true,
          });
        } catch (err) {
          log.error('Failed to update language progress after transcription', { projectId, languageCode, error: (err as any)?.message || String(err) });
        }
      } catch (stepErr: any) {
        transcriptLogs[languageCode] = null;
        log.error('Transcription failed for language', {
          projectId,
          languageCode,
          error: stepErr?.message || String(stepErr),
        });
        await markLanguageFailure(projectId, languageCode, 'transcription', stepErr?.message || String(stepErr));
      }
    }

    const updatedProgress = await getLanguageProgress(projectId);
    const failedLanguageList = updatedProgress.progress.filter((row) => row.disabled).map((row) => row.languageCode);
    const activeProgress = updatedProgress.progress.filter((row) => !row.disabled);
    if (activeProgress.length === 0) {
      log.error('Transcription left no active languages', { projectId, failedLanguageList });
      throw new Error('Transcription failed for all active languages');
    }
    const remainingLanguages = updatedProgress.aggregate.transcription.remaining;

    const disabledAfter = new Set(failedLanguageList);
    const primaryLanguage = languagesFromConfig.find((code) => !disabledAfter.has(code))
      ?? activeProgress[0]?.languageCode
      ?? DEFAULT_LANGUAGE;
    const primaryLocalPath = (audioLocalPathsPayload && audioLocalPathsPayload[primaryLanguage])
      || (finalVoiceovers[primaryLanguage]?.localPath ?? snapshot.localPath);

    if (remainingLanguages.length > 0) {
      await setStatus(projectId, ProjectStatus.ProcessTranscription, 'Transcription in progress', {
        completedLanguages: activeProgress.filter((row) => row.transcriptionDone).map((row) => row.languageCode),
        pendingLanguages: remainingLanguages,
        failedLanguages: failedLanguageList,
        transcriptionLogs: transcriptLogs,
        transcriptionWorkspaceRoot: agentWorkspace,
        transcriptionWorkspaceByLanguage: workspaceByLanguage,
      });
      return;
    }

    if (!primaryLocalPath) {
      throw new Error('Primary voiceover file not found locally for transcription');
    }
    await fs.access(primaryLocalPath);

    await setStatus(projectId, ProjectStatus.ProcessMetadata, 'Generating metadata', {
      finalVoiceoverId: snapshot.finalVoiceoverId,
      audioLocalPath: primaryLocalPath,
      transcriptionWorkspace: agentWorkspace,
      transcriptionLog: transcriptLogs[primaryLanguage] ?? null,
      transcriptionLanguages: activeProgress.map((row) => row.languageCode),
      transcriptionLogs: transcriptLogs,
      transcriptionWorkspaceRoot: agentWorkspace,
      transcriptionWorkspaceByLanguage: workspaceByLanguage,
      failedLanguages: failedLanguageList,
    });
  } catch (err: any) {
    log.error('Transcription phase failed', {
      projectId,
      error: err?.message || String(err),
    });
    await setStatus(projectId, ProjectStatus.Error, 'Transcription failed');
    throw createHandledError('Transcription failed', err);
  }
}

async function maybeGenerateTemplateSentenceMetadata(params: {
  projectId: string;
  languageInfo: Awaited<ReturnType<typeof ensureLanguageWorkspace>>;
  scriptWorkspaceV2: string;
}) {
  const { projectId, languageInfo, scriptWorkspaceV2 } = params;
  const originalScriptPath = await readTemplateOriginalPath(languageInfo);
  if (!originalScriptPath) {
    log.warn('Template original script not found for sentence metadata', {
      projectId,
      languageCode: languageInfo.languageCode,
      originalScriptPath: null,
    });
    return;
  }
  const logDir = await ensureLanguageLogDir(languageInfo, 'metadata');
  try {
    await generateSentenceMetadata({
      projectId,
      workspaceRoot: languageInfo.languageWorkspace,
      commandsWorkspaceRoot: languageInfo.workspaceRoot,
      scriptWorkspaceV2,
      logDir,
      originalScriptPath,
    });
  } catch (err: any) {
    log.error('Sentence metadata generation failed', {
      projectId,
      languageCode: languageInfo.languageCode,
      error: err?.message || String(err),
    });
  }
}
