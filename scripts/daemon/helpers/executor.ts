import { ProjectStatus } from '@/shared/constants/status';
import { getCreationSnapshot, setStatus } from './db';
import { log } from './logger';
import { getDaemonConfig } from './executor/context';
import { handleScriptPhase } from './executor/script-phase';
import { handleAudioPhase } from './executor/audio-phase';
import { handleTranscriptionPhase } from './executor/transcription-phase';
import { handleMetadataPhase } from './executor/metadata-phase';
import { handleCaptionsPhase } from './executor/captions-phase';
import { handleImagesPhase } from './executor/images-phase';
import { handleVideoPartsPhase } from './executor/video-parts-phase';
import { handleVideoMainPhase } from './executor/video-main-phase';
import { isHandledError } from './executor/error';

export { __setDaemonConfigForTests } from './executor/context';

export async function executeForProject(projectId: string, status: ProjectStatus, jobPayload?: Record<string, unknown> | null): Promise<void> {
  const cfg = await getCreationSnapshot(projectId);
  const creationGuidance = cfg.scriptCreationGuidanceEnabled ? (cfg.scriptCreationGuidance || '').trim() : '';
  const avoidanceGuidance = cfg.scriptAvoidanceGuidanceEnabled ? (cfg.scriptAvoidanceGuidance || '').trim() : '';
  const daemonConfig = getDaemonConfig();

  if (creationGuidance || avoidanceGuidance) {
    log.info('Using script guidance', {
      projectId,
      creationGuidancePreview: creationGuidance ? creationGuidance.slice(0, 120) : null,
      avoidanceGuidancePreview: avoidanceGuidance ? avoidanceGuidance.slice(0, 120) : null,
    });
  }

  try {
    switch (status) {
      case ProjectStatus.ProcessScript: {
        await handleScriptPhase({
          projectId,
          cfg,
          jobPayload: jobPayload ?? {},
          creationGuidance,
          avoidanceGuidance,
        });
        return;
      }
      case ProjectStatus.ProcessAudio: {
        await handleAudioPhase({
          projectId,
          cfg,
          jobPayload: jobPayload ?? {},
        });
        return;
      }
      case ProjectStatus.ProcessTranscription: {
        await handleTranscriptionPhase({
          projectId,
          jobPayload: jobPayload ?? {},
          cfg,
          daemonConfig,
        });
        return;
      }
      case ProjectStatus.ProcessMetadata: {
        await handleMetadataPhase({
          projectId,
          cfg,
          daemonConfig,
        });
        return;
      }
      case ProjectStatus.ProcessCaptionsVideo: {
        await handleCaptionsPhase({
          projectId,
          cfg,
          daemonConfig,
        });
        return;
      }
      case ProjectStatus.ProcessImagesGeneration: {
        await handleImagesPhase({
          projectId,
          cfg,
          jobPayload: jobPayload ?? {},
          daemonConfig,
        });
        return;
      }
      case ProjectStatus.ProcessVideoPartsGeneration: {
        await handleVideoPartsPhase({
          projectId,
          cfg,
          jobPayload: jobPayload ?? {},
          daemonConfig,
        });
        return;
      }
      case ProjectStatus.ProcessVideoMain: {
        await handleVideoMainPhase({
          projectId,
          cfg,
          jobPayload: jobPayload ?? {},
          daemonConfig,
        });
        return;
      }
      default:
        return;
    }
  } catch (err: any) {
    if (!isHandledError(err)) {
      log.error('Executor crashed', { projectId, status, error: err?.message || String(err) });
      await setStatus(projectId, ProjectStatus.Error, 'Executor crashed');
    }
    throw err;
  }
}

export async function executeJob(job: { id: string; projectId: string; type: string; payload: Record<string, unknown> | null }): Promise<boolean> {
  const { projectId, type, payload } = job;
  let status: ProjectStatus;
  switch (type) {
    case 'script':
      status = ProjectStatus.ProcessScript;
      break;
    case 'audio':
      status = ProjectStatus.ProcessAudio;
      break;
    case 'transcription':
      status = ProjectStatus.ProcessTranscription;
      break;
    case 'metadata':
      status = ProjectStatus.ProcessMetadata;
      break;
    case 'captions_video':
      status = ProjectStatus.ProcessCaptionsVideo;
      break;
    case 'images':
      status = ProjectStatus.ProcessImagesGeneration;
      break;
    case 'video_parts':
      status = ProjectStatus.ProcessVideoPartsGeneration;
      break;
    case 'video_main':
      status = ProjectStatus.ProcessVideoMain;
      break;
    default:
      log.warn('Unknown job type; skipping', { type });
      return true;
  }
  try {
    await executeForProject(projectId, status, payload);
    return true;
  } catch {
    return false;
  }
}
