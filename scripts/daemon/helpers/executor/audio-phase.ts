import { ProjectStatus } from '@/shared/constants/status';
import { log } from '../logger';
import {
  addAudioCandidate,
  createJob,
  getLanguageProgress,
  getScriptText,
  markLanguageFailure,
  setStatus,
  updateLanguageProgress,
} from '../db';
import { generateVoiceovers } from '../prompt-to-wav';
import type { CreationSnapshot } from './types';
import { createHandledError } from './error';
import { ensureProjectScaffold, ensureLanguageWorkspace } from '../language-workspace';
import { isCustomTemplateData } from '@/shared/templates/custom-data';

type SupportedVoiceProvider = 'minimax' | 'elevenlabs' | 'inworld';
const STYLE_SUPPORTED_PROVIDERS: ReadonlySet<SupportedVoiceProvider> = new Set(['elevenlabs']);

type AudioPhaseArgs = {
  projectId: string;
  cfg: CreationSnapshot;
  jobPayload: Record<string, unknown>;
};

function extractAudioStylePrompt(snapshot: CreationSnapshot): string | null {
  if (!snapshot.audioStyleGuidanceEnabled) return null;
  if (typeof snapshot.audioStyleGuidance !== 'string') return null;
  const trimmed = snapshot.audioStyleGuidance.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function providerSupportsAudioStyle(provider: SupportedVoiceProvider | null): boolean {
  if (!provider) return false;
  return STYLE_SUPPORTED_PROVIDERS.has(provider);
}

export async function handleAudioPhase({ projectId, cfg, jobPayload }: AudioPhaseArgs) {
  try {
    const forceAutoApproveAudio = isCustomTemplateData(cfg.template?.customData);
    const requestedLanguage = typeof jobPayload.audioLanguage === 'string' ? jobPayload.audioLanguage : null;
    const payloadLanguages = Array.isArray(jobPayload.languages)
      ? (jobPayload.languages as unknown[]).filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
      : [];
    const cfgLanguages = Array.isArray((cfg as any).languages)
      ? ((cfg as any).languages as unknown[]).filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
      : [];
    const fallbackLanguage = cfg.targetLanguage || 'en';
    const languagesToProcess = requestedLanguage
      ? [requestedLanguage]
      : (payloadLanguages.length > 0 ? payloadLanguages : cfgLanguages.length > 0 ? cfgLanguages : [fallbackLanguage]);

    const uniqueLanguages = Array.from(new Set(languagesToProcess.map((code) => code.toLowerCase())));
    if (uniqueLanguages.length === 0) {
      uniqueLanguages.push(fallbackLanguage);
    }

    const progress = await getLanguageProgress(projectId).catch(() => null);
    const disabledLanguages = new Set(
      (progress?.progress ?? [])
        .filter((row) => row.disabled)
        .map((row) => row.languageCode),
    );

    const activeLanguages = uniqueLanguages.filter((code) => !disabledLanguages.has(code));
    if (activeLanguages.length === 0) {
      log.error('Audio phase has no active languages to process', { projectId, requestedLanguages: uniqueLanguages });
      throw new Error('No active languages available for audio generation');
    }

    await ensureProjectScaffold(projectId);

    const resultsByLanguage: Array<{
      languageCode: string;
      uploaded: { id: string; path: string; url: string; localPath: string }[];
      runDirectory: string;
      partialError?: Error;
    }> = [];
    const failedLanguages: string[] = [];

    const sanitizeVoiceId = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const jobVoiceOverrideId = sanitizeVoiceId(
      typeof jobPayload.voice === 'string'
        ? jobPayload.voice
        : typeof (jobPayload as any).voiceId === 'string'
          ? ((jobPayload as any).voiceId as string)
          : null,
    );
    const configVoiceId = sanitizeVoiceId(cfg.voiceId ?? null);
    const voiceAssignmentsMap = cfg.voiceAssignments && typeof cfg.voiceAssignments === 'object' && !Array.isArray(cfg.voiceAssignments)
      ? (cfg.voiceAssignments as Record<string, { voiceId: string | null; voiceProvider?: string | null; source?: 'project' | 'fallback' | 'none' }>)
      : null;
    const voiceProvidersMap = new Map<string, string>();
    if (cfg.voiceProviders && typeof cfg.voiceProviders === 'object' && !Array.isArray(cfg.voiceProviders)) {
      for (const [voiceId, provider] of Object.entries(cfg.voiceProviders)) {
        if (typeof provider === 'string' && voiceId) {
          voiceProvidersMap.set(voiceId, provider);
        }
      }
    }
    if (voiceAssignmentsMap) {
      for (const entry of Object.values(voiceAssignmentsMap)) {
        if (entry?.voiceId && typeof entry.voiceProvider === 'string' && entry.voiceProvider.trim()) {
          voiceProvidersMap.set(entry.voiceId, entry.voiceProvider);
        }
      }
    }

    const resolveVoiceForLanguage = (languageCode: string): { voiceId: string | null; voiceProvider: SupportedVoiceProvider | null; source: 'job' | 'mapping' | 'config' | 'none'; mappingSource?: 'project' | 'fallback' | 'none' } => {
      if (jobVoiceOverrideId) {
        const provider = normalizeProvider(voiceProvidersMap.get(jobVoiceOverrideId) ?? null);
        if (!provider) {
          log.error('Voice override missing provider', { projectId, languageCode, voiceId: jobVoiceOverrideId });
          return { voiceId: null, voiceProvider: null, source: 'job' };
        }
        return { voiceId: jobVoiceOverrideId, voiceProvider: provider, source: 'job' };
      }
      const normalized = languageCode.trim().toLowerCase();
      const entry = voiceAssignmentsMap?.[normalized] ?? voiceAssignmentsMap?.[languageCode] ?? null;
      if (entry) {
        const mapped = sanitizeVoiceId(entry.voiceId);
        if (mapped) {
          const provider = normalizeProvider(entry.voiceProvider ?? voiceProvidersMap.get(mapped) ?? null);
          if (!provider) {
            log.error('Mapped voice missing provider', { projectId, languageCode, voiceId: mapped, source: entry.source });
            return { voiceId: null, voiceProvider: null, source: 'mapping', mappingSource: entry.source };
          }
          return {
            voiceId: mapped,
            voiceProvider: provider,
            source: 'mapping',
            mappingSource: entry.source,
          };
        }
        return { voiceId: null, voiceProvider: null, source: 'none', mappingSource: entry.source };
      }
      if (configVoiceId) {
        const provider = normalizeProvider(voiceProvidersMap.get(configVoiceId) ?? null);
        if (!provider) {
          log.error('Configured voice missing provider', { projectId, languageCode, voiceId: configVoiceId });
          return { voiceId: null, voiceProvider: null, source: 'config' };
        }
        return { voiceId: configVoiceId, voiceProvider: provider, source: 'config' };
      }
      return { voiceId: null, voiceProvider: null, source: 'none' };
    };

    const takeCount = 1;

    const SUPPORTED_PROVIDERS: Set<SupportedVoiceProvider> = new Set(['minimax', 'elevenlabs', 'inworld']);
    const normalizeProvider = (value: string | null | undefined): SupportedVoiceProvider | null => {
      if (typeof value !== 'string') return null;
      const normalized = value.trim().toLowerCase();
      return SUPPORTED_PROVIDERS.has(normalized as SupportedVoiceProvider) ? (normalized as SupportedVoiceProvider) : null;
    };
    const audioStylePrompt = extractAudioStylePrompt(cfg);

    for (const code of activeLanguages) {
      const languageCode = code.toLowerCase();
      try {
        const scriptText = await getScriptText(projectId, languageCode) ?? await getScriptText(projectId);
        if (!scriptText || !scriptText.trim()) {
          throw new Error(`Project script is missing for language ${languageCode}; cannot generate audio`);
        }

        const languageInfo = await ensureLanguageWorkspace(projectId, languageCode);
        const voiceResolution = resolveVoiceForLanguage(languageCode);
        if (!voiceResolution.voiceId || !voiceResolution.voiceProvider) {
          log.error('No supported voice configured for language', {
            projectId,
            languageCode,
            voiceSource: voiceResolution.source,
            voiceId: voiceResolution.voiceId,
          });
          await markLanguageFailure(projectId, languageCode, 'audio', 'Voice provider missing or unsupported');
          failedLanguages.push(languageCode);
          continue;
        }
        const stylePrompt = providerSupportsAudioStyle(voiceResolution.voiceProvider) ? audioStylePrompt : null;
        const result = await generateVoiceovers({
          projectId,
          languageCode,
          languageWorkspace: languageInfo.languageWorkspace,
          commandsWorkspaceRoot: languageInfo.workspaceRoot,
          text: scriptText,
          takeCount,
          voice: voiceResolution.voiceId,
          voiceProvider: voiceResolution.voiceProvider,
          style: stylePrompt,
        });
        const { runDirectory, outputs, error: partialError } = result;

        log.info('Voiceover generation completed', {
          projectId,
          languageCode,
          runDirectory,
          takes: outputs.length,
          voiceId: voiceResolution.voiceId,
          voiceProvider: voiceResolution.voiceProvider,
          voiceSource: voiceResolution.source,
          voiceMappingSource: voiceResolution.mappingSource ?? null,
          audioStyleApplied: !!stylePrompt,
        });

        const uploaded: { id: string; path: string; url: string; localPath: string }[] = [];
        for (const output of outputs) {
          const candidate = await addAudioCandidate(projectId, output.path, languageCode);
          uploaded.push(candidate);
        }

        if (uploaded.length === 0) {
          throw new Error(`Prompt-to-wav returned no audio files for language ${languageCode}`);
        }

        resultsByLanguage.push({ languageCode, uploaded, runDirectory, partialError: partialError ?? undefined });
      } catch (err: any) {
        failedLanguages.push(languageCode);
        log.error('Voiceover generation failed', {
          projectId,
          languageCode,
          error: err?.message || String(err),
        });
        await markLanguageFailure(projectId, languageCode, 'audio', err?.message || String(err));
      }
    }

    const successfulLanguages = resultsByLanguage.map((entry) => entry.languageCode);
    if (successfulLanguages.length === 0) {
      log.error('Audio phase produced no successful voiceovers', { projectId, failedLanguages });
      throw new Error('Audio generation failed for all active languages');
    }

    const primaryLanguageCode = (cfg.targetLanguage || fallbackLanguage).toLowerCase();
    const primaryResult = resultsByLanguage.find((entry) => entry.languageCode === primaryLanguageCode)
      ?? resultsByLanguage[0];

    const shouldAutoApproveAudio = forceAutoApproveAudio || !!cfg.autoApproveAudio;

    if (shouldAutoApproveAudio && primaryResult) {
      const [primary] = primaryResult.uploaded;
      const selections: Record<string, string> = {};
      const finalPaths: Record<string, string | null> = {};
      const finalUrls: Record<string, string | null> = {};
      const finalLocals: Record<string, string | null> = {};
      for (const entry of resultsByLanguage) {
        const [pick] = entry.uploaded;
        selections[entry.languageCode] = pick?.id ?? entry.uploaded[0]?.id ?? '';
        finalPaths[entry.languageCode] = pick?.path ?? null;
        finalUrls[entry.languageCode] = pick?.url ?? null;
        finalLocals[entry.languageCode] = pick?.localPath ?? null;
      }
      await setStatus(projectId, ProjectStatus.ProcessTranscription, 'Transcribing voiceovers', {
        finalVoiceoverId: primary?.id ?? null,
        finalVoiceovers: selections,
        finalVoiceoverPaths: finalPaths,
        finalVoiceoverUrls: finalUrls,
        finalVoiceoverLocalPaths: finalLocals,
        audioRunDirectory: primaryResult.runDirectory,
        audioLocalPath: primary?.localPath ?? primaryResult.uploaded[0]?.localPath ?? null,
        audioLanguage: primaryResult.languageCode,
        audioLanguages: successfulLanguages,
        failedLanguages,
      });
      for (const languageCode of successfulLanguages) {
        try {
          await updateLanguageProgress(projectId, {
            languageCode,
            transcriptionDone: false,
            captionsDone: false,
            videoPartsDone: false,
            finalVideoDone: false,
          });
        } catch (err: any) {
          log.warn('Failed to reset language progress before transcription', {
            projectId,
            languageCode,
            error: err?.message || String(err),
          });
        }
      }
      if (cfg.userId) {
        for (const languageCode of successfulLanguages) {
          const candidateId = selections[languageCode];
          if (!candidateId) continue;
          const payload: Record<string, unknown> = {
            languageCode,
            audioCandidateId: candidateId,
            audioLocalPath: finalLocals[languageCode] ?? null,
            audioPath: finalPaths[languageCode] ?? null,
            audioUrl: finalUrls[languageCode] ?? null,
          };
          try {
            await createJob(projectId, cfg.userId, 'transcription', payload);
          } catch (err) {
            log.error('Failed to enqueue transcription job', {
              projectId,
              languageCode,
              error: (err as any)?.message || String(err),
            });
          }
        }
      } else {
        log.warn('Creation snapshot missing userId; cannot enqueue transcription jobs automatically', { projectId });
      }
    } else {
      const candidateMap: Record<string, { languageCode: string; candidateIds: string[]; localPaths: Record<string, string> }> = {};
      for (const entry of resultsByLanguage) {
        candidateMap[entry.languageCode] = {
          languageCode: entry.languageCode,
          candidateIds: entry.uploaded.map((c) => c.id),
          localPaths: entry.uploaded.reduce<Record<string, string>>((acc, candidate) => {
            const local = candidate.localPath;
            if (local) acc[candidate.id] = local;
            return acc;
          }, {}),
        };
      }
      await setStatus(projectId, ProjectStatus.ProcessAudioValidate, 'Voiceover ready for validation', {
        audioLanguages: successfulLanguages,
        audioCandidates: candidateMap,
        failedLanguages,
      });
    }

    for (const entry of resultsByLanguage) {
      if (entry.partialError) {
        log.warn('Voiceover generation completed with partial errors', {
          projectId,
          languageCode: entry.languageCode,
          message: entry.partialError.message,
        });
      }
    }
    if (failedLanguages.length > 0) {
      log.warn('Voiceover generation skipped failed languages', {
        projectId,
        failedLanguages,
      });
    }
  } catch (err: any) {
    log.error('Audio phase failed', {
      projectId,
      error: err?.message || String(err),
    });
    await setStatus(projectId, ProjectStatus.Error, 'Voiceover generation failed');
    throw createHandledError('Voiceover generation failed', err);
  }
}
