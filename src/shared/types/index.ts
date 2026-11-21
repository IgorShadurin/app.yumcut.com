import { ProjectStatus } from '../constants/status';
import { TokenTransactionType, TOKEN_COSTS } from '../constants/token-costs';
import type { SchedulerCadenceValue } from '@/shared/constants/publish-scheduler';
import type { TargetLanguageCode } from '@/shared/constants/languages';
import type { ProjectExperience } from '@/shared/constants/project-experience';
import type { ContentTone } from '@/shared/constants/content-tone';
import type { CharacterCreationSettings } from '@/shared/constants/character-creation-settings';
import type { CharacterVideoGenerationMode, CharacterVideoQuality } from '@/shared/constants/character-video-quality';

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
  projectEmailsEnabled: boolean;
  autoApproveScript: boolean;
  autoApproveAudio: boolean;
  watermarkEnabled: boolean;
  captionsEnabled: boolean;
  characterCreationSettings: CharacterCreationSettings;
  defaultDurationSeconds: number | null;
  sidebarOpen: boolean;
  defaultUseScript: boolean;
  characterContentTone: ContentTone;
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
  projectCreationEnabled: boolean;
  projectCreationDisabledReason: string;
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

export interface LocalizedCatalogTextDTO {
  en: string;
  ru: string;
}

export interface CharacterCatalogMetricsDTO {
  creationsCount: number;
  favoritesCount: number;
  isFavorited: boolean;
}

export interface MobileCharacterCatalogCharacterDTO extends CharacterCatalogMetricsDTO {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  hiddenSearchText: LocalizedCatalogTextDTO;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  previewVideoHasAudio: boolean;
  defaultVoiceId?: string | null;
  defaultVoiceProvider?: string | null;
}

export interface MobileCharacterCatalogCategoryDTO {
  id: string;
  title: LocalizedCatalogTextDTO;
  subtitle: LocalizedCatalogTextDTO;
  description: LocalizedCatalogTextDTO;
  hiddenSearchText: LocalizedCatalogTextDTO;
  characters: MobileCharacterCatalogCharacterDTO[];
}

export interface MobileCharacterCatalogDTO {
  categories: MobileCharacterCatalogCategoryDTO[];
}

export type ImagePrankMode = 'catalog' | 'custom-two-image' | 'custom-one-image';

export type ImagePrankSourceImageRole = 'prank' | 'target' | 'reference';

export interface ImagePrankSourceImageDTO {
  role: ImagePrankSourceImageRole;
  label: string;
  imageUrl: string | null;
  imagePath?: string | null;
  previewImageUrl?: string | null;
  previewImagePath?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ImagePrankCatalogItemDTO {
  id: string;
  slug: string;
  title: LocalizedCatalogTextDTO;
  description: LocalizedCatalogTextDTO;
  hiddenSearchText: LocalizedCatalogTextDTO;
  imageUrl: string;
  imagePath: string;
  previewImageUrl?: string | null;
  previewImagePath?: string | null;
  categoryId: string;
  categorySlug: string;
  categoryTitle: LocalizedCatalogTextDTO;
  subcategoryId?: string | null;
  subcategorySlug?: string | null;
  subcategoryTitle?: LocalizedCatalogTextDTO | null;
}

export interface ImagePrankCatalogSubcategoryDTO {
  id: string;
  categoryId: string;
  slug: string;
  title: LocalizedCatalogTextDTO;
  subtitle: LocalizedCatalogTextDTO;
  description: LocalizedCatalogTextDTO;
  hiddenSearchText: LocalizedCatalogTextDTO;
  items: ImagePrankCatalogItemDTO[];
}

export interface ImagePrankCatalogCategoryDTO {
  id: string;
  slug: string;
  title: LocalizedCatalogTextDTO;
  subtitle: LocalizedCatalogTextDTO;
  description: LocalizedCatalogTextDTO;
  hiddenSearchText: LocalizedCatalogTextDTO;
  subcategories?: ImagePrankCatalogSubcategoryDTO[];
  items: ImagePrankCatalogItemDTO[];
}

export interface ImagePrankCatalogDTO {
  categories: ImagePrankCatalogCategoryDTO[];
}

export interface ImagePrankReuseDTO {
  projectId: string;
  mode: ImagePrankMode;
  model?: string | null;
  prompt: string;
  catalogItem: {
    id: string;
    slug: string;
    title: string;
    categorySlug?: string | null;
    categoryTitle?: string | null;
    subcategorySlug?: string | null;
    subcategoryTitle?: string | null;
  } | null;
  sourceImages: ImagePrankSourceImageDTO[];
}

export interface MobileCharacterProfileDTO extends CharacterCatalogMetricsDTO {
  id: string;
  characterId: string;
  slug: string;
  name: string;
  title: string;
  tagline: string;
  bio: string;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  previewVideoHasAudio: boolean;
  defaultVoiceId?: string | null;
  defaultVoiceProvider?: string | null;
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
  rawVideoPath?: string | null;
  rawVideoUrl?: string | null;
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
  rawVideoPath?: string | null;
  rawVideoUrl?: string | null;
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

export interface AdminEmailSettingsDTO {
  followUp24hEnabled: boolean;
}

export interface AdminEmailTemplatePreviewDTO {
  language: 'en' | 'ru';
  label: string;
  path: string;
  markdown: string;
}

export interface AdminProjectCreationSettingsDTO {
  projectCreationEnabled: boolean;
  projectCreationDisabledReason: string;
  signUpBonusByLanguage: {
    en: { enabled: boolean; amount: number };
    ru: { enabled: boolean; amount: number };
  };
}

export type ProjectCreationAttemptResult = 'draft_created' | 'paywall_shown' | 'confirm_shown' | 'project_created';
export type ProjectCreationAttemptPromptMode = 'idea' | 'script';
export type ProjectCreationAttemptExperience = 'story' | 'character' | 'image-generation';

export interface ProjectCreationAttemptContextDTO {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  intent?: string | null;
  sourceToolSlug?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
  query?: Record<string, string | string[]>;
  rawContext?: Record<string, unknown>;
}

export interface ProjectCreationAttemptRequestDTO extends ProjectCreationAttemptContextDTO {
  clientAttemptId?: string;
  result: ProjectCreationAttemptResult;
  promptText?: string | null;
  promptMode?: ProjectCreationAttemptPromptMode | null;
  projectExperience?: ProjectCreationAttemptExperience | null;
  durationSeconds?: number | null;
  tokenCost?: number | null;
  tokenBalance?: number | null;
  mainPageMode?: string | null;
  mainPageCategoryId?: string | null;
  characterSlug?: string | null;
  templateId?: string | null;
  languageCodes?: string[];
  languageVoices?: LanguageVoiceMap;
  settingsSnapshot?: Record<string, unknown>;
}

export interface ProjectCreationAttemptResponseDTO {
  id: string;
  clientAttemptId: string;
  result: ProjectCreationAttemptResult;
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
  imageGeneration?: {
    kind?: 'standalone' | 'image-prank';
    mode?: ImagePrankMode | null;
    displayLabel?: string | null;
    prompt: string;
    userPrompt?: string | null;
    provider: string | null;
    model: string | null;
    width: number | null;
    height: number | null;
    resultImageUrl: string | null;
    resultImagePath: string | null;
    resultFormat: string | null;
    originalImageUrl: string | null;
    characterTitle: string | null;
    variationTitle: string | null;
    source: CharacterSelectionSource | null;
    sourceImages?: ImagePrankSourceImageDTO[];
    catalogItem?: {
      id: string;
      slug: string;
      title: string;
      categorySlug?: string | null;
      categoryTitle?: string | null;
      subcategorySlug?: string | null;
      subcategoryTitle?: string | null;
    } | null;
    estimatedDurationSeconds: number;
    startedAt: string;
  } | null;
  tokensUsed?: number;
  tokensRefunded?: number;
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
    characterVideoQuality?: CharacterVideoQuality;
    videoGeneration?: {
      mode: CharacterVideoGenerationMode;
      lipsyncPrompt?: string | null;
    } | null;
    projectExperience?: ProjectExperience;
    contentTone?: ContentTone;
    characterSelection?: {
      type: 'global' | 'user' | 'dynamic' | null;
      source?: CharacterSelectionSource;
      characterId?: string | null;
      characterSlug?: string | null;
      variationId?: string | null;
      userCharacterId?: string | null;
      characterTitle?: string | null;
      variationTitle?: string | null;
      imageUrl?: string | null;
      previewVideoUrl?: string | null;
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
  characterProjectTokens: number;
  characterProjectTokenCosts: typeof TOKEN_COSTS.characterProjects;
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

export interface SubscriptionPlanDTO {
  planKey: 'weekly' | 'monthly' | 'monthly_pro';
  productId: string;
  label: string;
  interval: 'week' | 'month';
  priceUsd: number;
  tokens: number;
  maxValues: {
    videos: number;
  };
  benefits: Array<{
    key: 'tokens_per_charge' | 'images_per_period' | 'videos_per_period' | 'most_popular';
    tokens?: number;
    images?: number;
    videos?: number;
    interval?: 'week' | 'month';
  }>;
  configured: boolean;
}

export interface SubscriptionStatusDTO {
  active: boolean;
  productId: string | null;
  expiresAt: string | null;
  lastPurchaseAt: string | null;
  lastTransactionId: string | null;
  environment: string | null;
  cancelAtPeriodEnd: boolean;
  cancellationEffectiveAt: string | null;
  plans: SubscriptionPlanDTO[];
  stripeReady: boolean;
  canManageBilling: boolean;
}

export interface MobilePaywallConfigDTO {
  purchasesEnabled?: boolean;
  shutdownDate?: string;
  plans: Array<{
    planKey: 'weekly' | 'monthly' | 'monthly_pro';
    productId: string;
    interval: 'week' | 'month';
    tokens: number;
    maxValues: {
      videos: number;
    };
  }>;
}

export interface MobileImagePrankModelOptionDTO {
  id: string;
  label: string;
  isDefault: boolean;
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
  creationAttemptId?: string | null;
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
  outputType?: 'video' | 'image';
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
    characterVideoQuality?: CharacterVideoQuality;
    videoGeneration?: {
      mode?: CharacterVideoGenerationMode;
      lipsyncPrompt?: string;
    };
    projectExperience?: ProjectExperience;
    imagePrank?: {
      mode: ImagePrankMode;
      catalogItemId?: string;
      model?: string;
      sourceImages: Array<{
        role: ImagePrankSourceImageRole;
        path: string;
        url: string;
        label?: string;
        width?: number | null;
        height?: number | null;
      }>;
    };
    contentTone?: ContentTone;
    creationAttemptId?: string | null;
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
