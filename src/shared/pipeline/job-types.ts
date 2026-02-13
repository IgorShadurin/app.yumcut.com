import { ProjectStatus } from '@/shared/constants/status';

// Single source of truth for mapping project status -> daemon job type.
export function jobTypeForStatus(status: ProjectStatus): string | null {
  switch (status) {
    case ProjectStatus.New:
    case ProjectStatus.ProcessScript:
      return 'script';
    case ProjectStatus.ProcessAudio:
      return 'audio';
    case ProjectStatus.ProcessTranscription:
      return 'transcription';
    case ProjectStatus.ProcessMetadata:
      return 'metadata';
    case ProjectStatus.ProcessCaptionsVideo:
      return 'captions_video';
    case ProjectStatus.ProcessImagesGeneration:
      return 'images';
    case ProjectStatus.ProcessVideoPartsGeneration:
      return 'video_parts';
    case ProjectStatus.ProcessVideoMain:
      return 'video_main';
    default:
      return null;
  }
}

export function legalStatusTypePairs(): { status: ProjectStatus; type: string }[] {
  return [
    { status: ProjectStatus.New, type: 'script' },
    { status: ProjectStatus.ProcessScript, type: 'script' },
    { status: ProjectStatus.ProcessAudio, type: 'audio' },
    { status: ProjectStatus.ProcessTranscription, type: 'transcription' },
    { status: ProjectStatus.ProcessMetadata, type: 'metadata' },
    { status: ProjectStatus.ProcessCaptionsVideo, type: 'captions_video' },
    { status: ProjectStatus.ProcessImagesGeneration, type: 'images' },
    { status: ProjectStatus.ProcessVideoPartsGeneration, type: 'video_parts' },
    { status: ProjectStatus.ProcessVideoMain, type: 'video_main' },
  ];
}

