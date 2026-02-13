import { ProjectStatus } from '@/shared/constants/status';

export const PIPELINE_ORDER: ProjectStatus[] = [
  ProjectStatus.ProcessScript,
  ProjectStatus.ProcessAudio,
  ProjectStatus.ProcessTranscription,
  ProjectStatus.ProcessMetadata,
  ProjectStatus.ProcessImagesGeneration,
  ProjectStatus.ProcessVideoPartsGeneration,
  ProjectStatus.ProcessVideoMain,
];

const statusOrder = new Map<ProjectStatus, number>(PIPELINE_ORDER.map((status, index) => [status, index]));

export function normalizeForOrdering(status: ProjectStatus): ProjectStatus | null {
  switch (status) {
    case ProjectStatus.New:
      return ProjectStatus.ProcessScript;
    case ProjectStatus.ProcessScriptValidate:
      return ProjectStatus.ProcessScript;
    case ProjectStatus.ProcessAudioValidate:
      return ProjectStatus.ProcessAudio;
    default:
      return statusOrder.has(status) ? status : null;
  }
}

export function downstreamStatuses(status: ProjectStatus): ProjectStatus[] {
  const normalized = normalizeForOrdering(status);
  if (!normalized) return [];
  const currentIndex = statusOrder.get(normalized);
  if (typeof currentIndex !== 'number') return [];
  return PIPELINE_ORDER.filter((candidate) => (statusOrder.get(candidate) ?? -1) > currentIndex);
}

