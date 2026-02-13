import { ProjectStatus } from './status';

export const STATUS_INFO: Record<ProjectStatus, { label: string; description: string }> = {
  [ProjectStatus.New]: {
    label: 'Queued',
    description: 'Queued for processing. The system will begin generating assets soon.',
  },
  [ProjectStatus.ProcessScript]: {
    label: 'Script Generation',
    description: 'Creating the script from your idea or preparing your exact script for the next steps.',
  },
  [ProjectStatus.ProcessScriptValidate]: {
    label: 'Script ready for validation',
    description: 'Your script is ready. Review and approve it to continue to voiceover.',
  },
  [ProjectStatus.ProcessAudio]: {
    label: 'Voiceover Generation',
    description: 'Producing the voiceover based on the approved script.',
  },
  [ProjectStatus.ProcessAudioValidate]: {
    label: 'Voiceover ready for approval',
    description: 'Voiceover options are ready. Approve your preferred track to continue.',
  },
  [ProjectStatus.ProcessTranscription]: {
    label: 'Voiceover Transcription',
    description: 'Generating a text transcript from the selected voiceover track.',
  },
  [ProjectStatus.ProcessMetadata]: {
    label: 'Metadata Generation',
    description: 'Creating titles, descriptions, and other metadata for your video.',
  },
  [ProjectStatus.ProcessCaptionsVideo]: {
    label: 'Captions Overlay Generation',
    description: 'Rendering a transparent captions video to overlay on the final cut.',
  },
  [ProjectStatus.ProcessImagesGeneration]: {
    label: 'Image Generation',
    description: 'Creating visual assets and images for your video.',
  },
  [ProjectStatus.ProcessVideoPartsGeneration]: {
    label: 'Video Parts Rendering',
    description: 'Rendering video segments and assembling components.',
  },
  [ProjectStatus.ProcessVideoMain]: {
    label: 'Final Video Compilation',
    description: 'Combining audio, visuals, and transitions into the final video.',
  },
  [ProjectStatus.Error]: {
    label: 'Error',
    description: 'A problem occurred while processing this project. You can retry or adjust content.',
  },
  [ProjectStatus.Done]: {
    label: 'Done',
    description: 'Your video is ready to view and download.',
  },
  [ProjectStatus.Cancelled]: {
    label: 'Cancelled',
    description: 'Processing was cancelled; no further work will be done.',
  },
};

export function statusLabel(status: ProjectStatus): string {
  return STATUS_INFO[status]?.label || status;
}

export function statusDescription(status: ProjectStatus): string | undefined {
  return STATUS_INFO[status]?.description;
}
