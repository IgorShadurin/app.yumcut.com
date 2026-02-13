import { ProjectStatus } from '../constants/status';
import { TokenTransactionType, TOKEN_COSTS } from '../constants/token-costs';
import type { SchedulerCadenceValue } from '@/shared/constants/publish-scheduler';
import type { TargetLanguageCode } from '@/shared/constants/languages';

export type LanguageVoiceMap = Partial<Record<TargetLanguageCode, string | null>>;

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
}

export interface UserSettingsDTO {
  includeDefaultMusic: boolean;
  addOverlay: boolean;
  includeCallToAction: boolean;
  autoApproveScript: boolean;
  autoApproveAudio: boolean;
  watermarkEnabled: boolean;
  captionsEnabled: boolean;
  defaultDurationSeconds: number | null;
  sidebarOpen: boolean;
  defaultUseScript: boolean;
  targetLanguages: string[];
  languageVoicePreferences: LanguageVoiceMap;
  scriptCreationGuidanceEnabled: boolean;
  scriptCreationGuidance: string;
  scriptAvoidanceGuidanceEnabled: boolean;
  scriptAvoidanceGuidance: string;
  audioStyleGuidanceEnabled: boolean;
  audioStyleGuidance: string;
  characterSelection: CharacterSelectionSnapshot | null;
  preferredVoiceId: string | null;
  preferredTemplateId: string | null;
  schedulerDefaultTimes: Record<string, string>;
  schedulerCadence: Record<string, SchedulerCadenceValue>;
}

export interface TemplateVoiceOptionDTO {
  id: string;
  title: string;
  description?: string | null;
  externalId?: string | null;
  languages?: string | null;
  speed?: 'fast' | 'slow' | null;
  gender?: 'female' | 'male' | null;
  previewPath?: string | null;
  voiceProvider?: string | null;
  weight?: number | null;
}

export type CharacterSelectionSource = 'global' | 'user' | 'dynamic';

export interface CharacterSelectionSnapshot {
  source: CharacterSelectionSource;
  characterId?: string | null;
  userCharacterId?: string | null;
  variationId?: string | null;
  characterTitle?: string | null;
  variationTitle?: string | null;
  imageUrl?: string | null;
  status?: 'ready' | 'processing' | 'failed';
  badgeLabel?: string | null;
  displayLabel?: string | null;
}

export interface ProjectListItemDTO {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
}

export interface MobileProjectDetailDTO {
  id: string;
  title: string;
  prompt: string;
  status: ProjectStatus;
  createdAt: string;
  finalVideoUrl: string | null;
  languages: string[];
  languageVariants?: ProjectLanguageVariantDTO[];
}

export interface ProjectAudioCandidateDTO {
  id: string;
  path: string;
  languageCode: string;
  url?: string | null;
  isFinal?: boolean;
  createdAt?: string | null;
}

export interface ProjectTemplateImageDTO {
  id: string;
  assetId: string;
  imageName: string;
  imageUrl: string | null;
  imagePath: string | null;
  model: string;
  prompt: string;
  sentence?: string | null;
  size?: string | null;
}

export interface ProjectLanguageVariantDTO {
  languageCode: string;
  isPrimary?: boolean;
  scriptText?: string | null;
  audioCandidates?: ProjectAudioCandidateDTO[];
  finalVoiceoverPath?: string | null;
  finalVoiceoverUrl?: string | null;
  finalVideoPath?: string | null;
  finalVideoUrl?: string | null;
}

export interface ProjectLanguageProgressStateDTO {
  languageCode: string;
  transcriptionDone: boolean;
  captionsDone: boolean;
  videoPartsDone: boolean;
  finalVideoDone: boolean;
  disabled: boolean;
  failedStep?: string | null;
  failureReason?: string | null;
}

export interface TelegramAccountStatusDTO {
  connected: boolean;
  enabled: boolean;
  account: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    linkedAt: string;
  } | null;
}

export interface TelegramLinkTokenDTO {
  code: string;
  deepLinkUrl: string | null;
  expiresAt: string;
}

export interface AdminNotificationSettingsDTO {
  notifyNewUser: boolean;
  notifyNewProject: boolean;
  notifyProjectDone: boolean;
  notifyProjectError: boolean;
}

export interface AdminVoiceProviderSettingsDTO {
  enabledProviders: string[];
}

export interface AdminImageEditorSettingsDTO {
  enabled: boolean;
}

export interface ProjectDetailDTO {
  id: string;
  userId: string;
  title: string;
  prompt: string | null;
  rawScript: string | null;
  finalScriptText?: string | null;
  finalVoiceoverPath?: string | null;
  finalVideoPath?: string | null;
  finalVideoUrl?: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  languages?: string[];
  languageVariants?: ProjectLanguageVariantDTO[];
  languageProgress?: ProjectLanguageProgressStateDTO[];
  statusInfo?: Record<string, unknown>;
  imageEditorEnabled?: boolean;
  templateImages?: ProjectTemplateImageDTO[];
  creation?: {
    durationSeconds?: number | null;
    useExactTextAsScript?: boolean | null;
    includeDefaultMusic?: boolean | null;
    addOverlay?: boolean | null;
    includeCallToAction?: boolean | null;
    autoApproveScript?: boolean | null;
    autoApproveAudio?: boolean | null;
    watermarkEnabled?: boolean | null;
    captionsEnabled?: boolean | null;
    scriptCreationGuidanceEnabled?: boolean | null;
    scriptCreationGuidance?: string | null;
    scriptAvoidanceGuidanceEnabled?: boolean | null;
    scriptAvoidanceGuidance?: string | null;
    audioStyleGuidanceEnabled?: boolean | null;
    audioStyleGuidance?: string | null;
    voiceId?: string | null;
    targetLanguage?: string | null;
    languages?: string[];
    languageVoiceAssignments?: LanguageVoiceMap;
    characterSelection?: {
      type: 'global' | 'user' | 'dynamic' | null;
      source?: CharacterSelectionSource;
      characterId?: string | null;
      variationId?: string | null;
      userCharacterId?: string | null;
      characterTitle?: string | null;
      variationTitle?: string | null;
      imageUrl?: string | null;
      generated?: boolean | null;
      status?: 'ready' | 'processing' | 'failed';
      badgeLabel?: string | null;
      displayLabel?: string | null;
    } | null;
  };
  template?: {
    id: string;
    title: string;
    description?: string | null;
    previewImageUrl: string;
    previewVideoUrl: string;
    customData?: import('@/shared/templates/custom-data').TemplateCustomData | null;
  } | null;
}

export interface ApiErrorShape {
  error: { code: string; message: string; details?: unknown };
}

export interface ProjectStatusDTO {
  status: ProjectStatus;
  statusInfo?: Record<string, unknown>;
  updatedAt: string;
}

export interface TokenSummaryDTO {
  balance: number;
  perSecondProject: number;
  minimumProjectTokens: number;
  minimumProjectSeconds: number;
  actionCosts: typeof TOKEN_COSTS.actions;
  signUpBonus: number;
}

export interface TokenTransactionDTO {
  id: string;
  delta: number;
  balanceAfter: number;
  type: TokenTransactionType;
  description: string | null;
  initiator: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface TokenHistoryDTO {
  items: TokenTransactionDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProjectDraftSettingsSnapshot {
  includeDefaultMusic: boolean;
  addOverlay: boolean;
  includeCallToAction: boolean;
  autoApproveScript: boolean;
  autoApproveAudio: boolean;
  watermarkEnabled: boolean;
  captionsEnabled: boolean;
  targetLanguages: string[];
  languageVoicePreferences: LanguageVoiceMap;
  scriptCreationGuidanceEnabled: boolean;
  scriptCreationGuidance: string;
  scriptAvoidanceGuidanceEnabled: boolean;
  scriptAvoidanceGuidance: string;
  audioStyleGuidanceEnabled: boolean;
  audioStyleGuidance: string;
}

export interface ProjectDraftCharacterSnapshot {
  characterId?: string;
  userCharacterId?: string;
  variationId?: string;
  characterTitle?: string;
  variationTitle?: string;
  source?: 'global' | 'user' | 'dynamic';
  imageUrl?: string | null;
}

export interface PendingProjectDraft {
  id: string;
  createdAt: string;
  text: string;
  useExact: boolean;
  // When true, the confirmation flow will create a ProjectGroup instead of a Project
  groupMode?: boolean;
  mode: 'idea' | 'script';
  durationSeconds: number | null;
  effectiveDurationSeconds: number;
  languageCode: string;
  languageCodes: string[];
  languageVoices?: LanguageVoiceMap;
  tokenCost: number;
  tokenBalance: number;
  hasEnoughTokens: boolean;
  settings: ProjectDraftSettingsSnapshot;
  // Selected voice id snapshot for display
  voiceId?: string | null;
  character?: ProjectDraftCharacterSnapshot | null;
  payload: {
    prompt?: string;
    rawScript?: string;
    durationSeconds?: number;
    characterSelection?: {
      characterId?: string;
      userCharacterId?: string;
      variationId?: string;
    };
    customImageStatus?: 'ready' | 'processing' | 'failed';
    useExactTextAsScript?: boolean;
    // Optional link to a selected template (when not using the default)
    templateId?: string;
    voiceId?: string | null;
    languages?: string[];
    languageVoices?: LanguageVoiceMap;
  };
  // Optional snapshot to show in confirmation UI
  template?: {
    id: string;
    title: string;
    description?: string | null;
    previewImageUrl: string;
    previewVideoUrl: string;
  } | null;
}

export interface PublishChannelDTO {
  id: string;
  provider: 'youtube';
  channelId: string;
  displayName: string | null;
  handle: string | null;
  languages: string[];
  disconnectedAt?: string | null;
  createdAt: string;
}

export interface SchedulerStateDTO {
  enabled: boolean;
  channels: PublishChannelDTO[];
  defaults: {
    times: Record<string, string>;
    cadence: Record<string, SchedulerCadenceValue>;
  };
  cadenceOptions: Array<{ value: SchedulerCadenceValue; label: string; days: number }>;
  languages: Array<{ code: string; label: string }>;
}

export interface PublishTaskDTO {
  id: string;
  projectId: string;
  languageCode: string;
  channelId: string;
  platform: string;
  providerTaskId?: string | null;
  videoUrl: string;
  publishAt: string;
  status: string;
  title: string | null;
  description: string | null;
}
