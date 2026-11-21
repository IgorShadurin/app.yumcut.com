"use client";
import { PaywallDialog, useShutdownDate } from '@/components/providers/ShutdownModeProvider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DurationDropdown } from './DurationDropdown';
import { LanguageDropdown } from './LanguageDropdown';
import { SettingsPopover } from './SettingsPopover';
import { CharacterModal, type CharacterSelection } from './CharacterModal';
import { VoicePickerDialog } from './VoicePickerDialog';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/common/Tooltip';
import {
  Wand2,
  Loader2,
  Settings,
  Smartphone,
  User,
  Lightbulb,
  FileText,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Images,
  Video,
  Crown,
  CreditCard,
} from 'lucide-react';
import { LIMITS } from '@/shared/constants/limits';
import { useTokenSummary } from '@/hooks/useTokenSummary';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { formatSubscriptionVideoCountForPaywall, getSubscriptionPlansForUi, type SubscriptionPlanKey } from '@/shared/constants/subscriptions';
import { pickRandomPlaceholder } from '@/shared/constants/prompt-placeholders';
import { DEFAULT_LANGUAGE, TargetLanguageCode, normalizeLanguageList, resolvePrimaryLanguage } from '@/shared/constants/languages';
import { useSettings } from '@/hooks/useSettings';
import { storeProjectDraft } from '@/lib/project-draft';
import { Api } from '@/lib/api-client';
import { toast } from 'sonner';
import type { CharacterSelectionSnapshot, PendingProjectDraft, LanguageVoiceMap, SubscriptionStatusDTO } from '@/shared/types';
import { useVoices } from '@/hooks/useVoices';
import { TemplatePicker, type TemplateSelection } from '@/components/templates/TemplatePicker';
import { normalizeLanguageVoiceMap, extractExplicitLanguageVoices } from '@/shared/voices/language-voice-map';
import { validateProjectState } from '@/shared/projects';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';
import { TokenLowBalanceAlert } from './TokenLowBalanceAlert';
import {
  collectProjectAttemptContext,
  recordProjectCreationAttemptFromClient,
  createProjectAttemptClientId,
} from '@/lib/project-attempts';
import {
  clearStoredToolPrefill,
  readStoredToolPrefill,
  readToolPrefillFromQuery,
  removeToolPrefillQueryParams,
  storeToolPrefill,
  TOOL_PREFILL_MAX_TEXT_CHARS,
  type ToolLandingPrefill,
} from './helpers';

function snapshotToSelection(snapshot: CharacterSelectionSnapshot | null | undefined): CharacterSelection | null {
  if (!snapshot) return null;
  return {
    source: snapshot.source,
    characterId: snapshot.characterId ?? undefined,
    userCharacterId: snapshot.userCharacterId ?? undefined,
    variationId: snapshot.variationId ?? undefined,
    characterTitle: snapshot.characterTitle ?? null,
    variationTitle: snapshot.variationTitle ?? null,
    imageUrl: snapshot.imageUrl ?? null,
    status: snapshot.status ?? null,
  };
}

function languagesEqual(a: TargetLanguageCode[], b: TargetLanguageCode[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((code, index) => b[index] === code);
}

const MAIN_PAGE_DURATION_OPTIONS = [30] as const;
const MAIN_PAGE_DURATION_LABELS: Partial<Record<number, string>> = {
  30: '30-70s',
};

type PromptInputCopy = {
  heading: string;
  headingImage: string;
  subtitle: string;
  subtitleImage: string;
  placeholder: string;
  imagePlaceholder: string;
  verticalFormat: string;
  settings: string;
  chooseCharacter: string;
  character: string;
  modeScriptTooltip: string;
  modeIdeaTooltip: string;
  modeScript: string;
  modeIdea: string;
  createProject: string;
  createImageProject: string;
  create: string;
  creationDisabledTitle: string;
  creationDisabledDescription: string;
  creationDisabledReasonLabel: string;
  creationDisabledNoReason: string;
  notEnoughTokensTitle: string;
  notEnoughTokensDescription: (projectCost: number, tokenBalance: number) => string;
  buyTokens: string;
  tokenWarning: (projectCost: number, tokenBalance: number, duration: number, useExact: boolean) => string;
  paywallTitle: string;
  paywallDescription: (projectCost: number, tokenBalance: number) => string;
  paywallPerCharge: string;
  paywallImagesPerPeriod: (images: string, interval: 'week' | 'month') => string;
  paywallVideosPerPeriod: (videos: string, interval: 'week' | 'month') => string;
  paywallChoosePlan: string;
  paywallOpeningCheckout: string;
  paywallCurrentPlan: string;
  paywallMonthlyLimitReached: string;
  paywallMonthlyLimitWait: string;
  paywallMonthlyLimitOr: string;
  paywallMonthlyLimitEmailLink: string;
  paywallUnavailable: string;
  paywallWeekLabel: string;
  paywallMonthLabel: string;
  paywallSavePrefix: string;
  paywallSaveSuffix: string;
};

const PROMPT_INPUT_COPY: Record<AppLanguageCode, PromptInputCopy> = {
  en: {
    heading: 'What video to make?',
    headingImage: 'What image to generate?',
    subtitle: "Describe your concept or paste your text script. We'll create the whole video.",
    subtitleImage: 'Describe the image you want. You can attach a character as the source reference.',
    placeholder: 'Describe your idea…',
    imagePlaceholder: 'Describe the image to generate…',
    verticalFormat: 'Vertical 9:16 format',
    settings: 'Settings',
    chooseCharacter: 'Choose character',
    character: 'Character',
    modeScriptTooltip: 'Now in Script mode. Your text is used as-is. Tap for Idea mode.',
    modeIdeaTooltip: 'Now in Idea mode. AI will write text. Tap for Script mode.',
    modeScript: 'Script',
    modeIdea: 'Idea',
    createProject: 'Create project',
    createImageProject: 'Create image',
    create: 'Create',
    creationDisabledTitle: 'New projects are temporarily disabled',
    creationDisabledDescription: 'Project creation is currently disabled.',
    creationDisabledReasonLabel: 'Reason',
    creationDisabledNoReason: 'No reason provided.',
    notEnoughTokensTitle: 'Not enough tokens',
    notEnoughTokensDescription: (projectCost, tokenBalance) =>
      `You need ${projectCost} tokens for this project but have ${tokenBalance}.`,
    buyTokens: 'Buy tokens in the app',
    tokenWarning: (projectCost, tokenBalance, duration, useExact) =>
      `— You need ${projectCost} tokens for a${useExact ? ' default ' : ' '}${duration}-second project, but only have ${tokenBalance}. Add more tokens or shorten the duration.`,
    paywallTitle: 'Unlock more videos',
    paywallDescription: (projectCost, tokenBalance) =>
      `You need ${projectCost} tokens but have ${tokenBalance}. Subscribe to add tokens automatically after each charge.`,
    paywallPerCharge: 'tokens per charge',
    paywallImagesPerPeriod: (images, interval) => `${images} images/${interval}`,
    paywallVideosPerPeriod: (videos, interval) => `${videos} videos/${interval}`,
    paywallChoosePlan: 'Choose plan',
    paywallOpeningCheckout: 'Opening checkout…',
    paywallCurrentPlan: 'Current plan',
    paywallMonthlyLimitReached: 'Current limit reached.',
    paywallMonthlyLimitWait: 'Wait for the next billing period to increase token amount,',
    paywallMonthlyLimitOr: 'or email YumCut founder via',
    paywallMonthlyLimitEmailLink: 'email',
    paywallUnavailable: 'Unavailable',
    paywallWeekLabel: 'week',
    paywallMonthLabel: 'month',
    paywallSavePrefix: 'Save',
    paywallSaveSuffix: 'vs weekly',
  },
  ru: {
    heading: 'Какое видео создать?',
    headingImage: 'Какое изображение сгенерировать?',
    subtitle: 'Опишите идею или вставьте готовый текст сценария. ЯмКат соберет ролик целиком.',
    subtitleImage: 'Опишите изображение. Можно прикрепить персонажа как исходный референс.',
    placeholder: 'Опишите вашу идею…',
    imagePlaceholder: 'Опишите изображение для генерации…',
    verticalFormat: 'Вертикальный формат 9:16',
    settings: 'Настройки',
    chooseCharacter: 'Выбрать персонажа',
    character: 'Персонаж',
    modeScriptTooltip: 'Сейчас режим сценария. Текст используется как есть. Нажмите для режима идеи.',
    modeIdeaTooltip: 'Сейчас режим идеи. ИИ напишет текст. Нажмите для режима сценария.',
    modeScript: 'Сценарий',
    modeIdea: 'Идея',
    createProject: 'Создать проект',
    createImageProject: 'Создать изображение',
    create: 'Создать',
    creationDisabledTitle: 'Создание проектов временно отключено',
    creationDisabledDescription: 'Создание новых проектов сейчас отключено.',
    creationDisabledReasonLabel: 'Причина',
    creationDisabledNoReason: 'Не указана.',
    notEnoughTokensTitle: 'Недостаточно токенов',
    notEnoughTokensDescription: (projectCost, tokenBalance) =>
      `Для этого проекта нужно ${projectCost} токенов, а у вас ${tokenBalance}.`,
    buyTokens: 'Купить токены',
    tokenWarning: (projectCost, tokenBalance, duration, useExact) =>
      `— Нужно ${projectCost} токенов для${useExact ? ' базового ' : ' '}${duration}-секундного проекта, но у вас только ${tokenBalance}. Пополните баланс или сократите длительность.`,
    paywallTitle: 'Откройте больше видео',
    paywallDescription: (projectCost, tokenBalance) =>
      `Для проекта нужно ${projectCost} токенов, а у вас ${tokenBalance}. Подписка будет автоматически пополнять токены после каждого успешного списания.`,
    paywallPerCharge: 'токенов за списание',
    paywallImagesPerPeriod: (images, interval) => `${images} изображений/${interval === 'week' ? 'неделя' : 'месяц'}`,
    paywallVideosPerPeriod: (videos, interval) => `${videos} видео/${interval === 'week' ? 'неделя' : 'месяц'}`,
    paywallChoosePlan: 'Выбрать план',
    paywallOpeningCheckout: 'Открываем оплату…',
    paywallCurrentPlan: 'Текущий план',
    paywallMonthlyLimitReached: 'Текущий лимит достигнут.',
    paywallMonthlyLimitWait: 'Дождитесь следующего биллинг-периода, чтобы увеличить количество токенов,',
    paywallMonthlyLimitOr: 'или напишите основателю YumCut на',
    paywallMonthlyLimitEmailLink: 'email',
    paywallUnavailable: 'Недоступно',
    paywallWeekLabel: 'неделю',
    paywallMonthLabel: 'месяц',
    paywallSavePrefix: 'Экономия',
    paywallSaveSuffix: 'vs weekly',
  },
};

type PromptInputProps = {
  projectType?: 'story' | 'image';
};

export function PromptInput({ projectType = 'story' }: PromptInputProps) {
  const { status: authStatus } = useSession();
  const shutdownDate = useShutdownDate();
  const { language } = useAppLanguage();
  const copy = PROMPT_INPUT_COPY[language];
  const { settings, update } = useSettings();
  const { defaultVoiceId, getByExternalId, autoVoices } = useVoices();
  const [text, setText] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [useExact, setUseExact] = useState(false);
  const [duration, setDuration] = useState<number>(MAIN_PAGE_DURATION_OPTIONS[0]);
  const [initedFromSettings, setInitedFromSettings] = useState(false);
  const [languages, setLanguages] = useState<TargetLanguageCode[]>([DEFAULT_LANGUAGE]);
  const [languageVoices, setLanguageVoices] = useState<LanguageVoiceMap>({});
  const [voicePickerLanguage, setVoicePickerLanguage] = useState<TargetLanguageCode | null>(null);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [charOpen, setCharOpen] = useState(false);
  const [selection, setSelection] = useState<CharacterSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingUseExact, setSavingUseExact] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [pendingToolPrefill, setPendingToolPrefill] = useState<ToolLandingPrefill | null>(null);
  const [toolPrefillReady, setToolPrefillReady] = useState(false);
  const [sourceToolSlug, setSourceToolSlug] = useState<string | null>(null);
  const { summary: tokenSummary, balance: tokenBalance, loading: tokensLoading } = useTokenSummary();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanKey | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatusDTO | null>(null);
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection | null>(null);
  const handleTemplateChange = useCallback((sel: TemplateSelection | null) => setTemplateSelection(sel), []);
  const router = useRouter();
  const showSettingsDot = !!settings && (
    !settings.includeDefaultMusic ||
    !settings.addOverlay ||
    !settings.includeCallToAction ||
    !settings.autoApproveScript ||
    !settings.autoApproveAudio ||
    !settings.watermarkEnabled ||
    !settings.captionsEnabled
  );

  const applyToolPrefill = useCallback((prefill: ToolLandingPrefill) => {
    if (typeof prefill.sourceToolSlug === 'string' && prefill.sourceToolSlug.trim().length > 0) {
      setSourceToolSlug(prefill.sourceToolSlug.trim());
    }

    if (typeof prefill.text === 'string' && prefill.text.trim().length > 0) {
      setText(prefill.text.slice(0, TOOL_PREFILL_MAX_TEXT_CHARS));
    }

    if (Array.isArray(prefill.languages) && prefill.languages.length > 0) {
      const normalizedLanguages = normalizeLanguageList(prefill.languages, DEFAULT_LANGUAGE);
      setLanguages(normalizedLanguages);
    }

    if (prefill.languageVoices) {
      const normalizedVoiceMap = normalizeLanguageVoiceMap(prefill.languageVoices);
      if (Object.keys(normalizedVoiceMap).length > 0) {
        setLanguageVoices(normalizedVoiceMap);
      }
    }

    if (typeof prefill.durationSeconds === 'number' && Number.isFinite(prefill.durationSeconds)) {
      const rounded = Math.max(1, Math.round(prefill.durationSeconds));
      const nextDuration = MAIN_PAGE_DURATION_OPTIONS.some((option) => option === rounded)
        ? rounded
        : MAIN_PAGE_DURATION_OPTIONS[0];
      setDuration(nextDuration);
    }
  }, []);

  useEffect(() => {
    const fromQuery = readToolPrefillFromQuery();
    if (fromQuery) {
      storeToolPrefill(fromQuery);
    }
    removeToolPrefillQueryParams();

    const stored = readStoredToolPrefill();
    setPendingToolPrefill(stored);
    setToolPrefillReady(true);
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    clearStoredToolPrefill();
  }, [authStatus]);

  // Pick a random placeholder once per mount (no persistence across reloads)
  useEffect(() => {
    if (language === 'ru') {
      setPlaceholder(copy.placeholder);
      return;
    }
    setPlaceholder(pickRandomPlaceholder());
  }, [copy.placeholder, language]);

  // Initialize local controls from global settings only once to avoid flicker
  useEffect(() => {
    if (!settings || initedFromSettings) return;
    setUseExact(!!(settings as any).defaultUseScript);
    if (typeof settings.defaultDurationSeconds === 'number') {
      const nextDuration = MAIN_PAGE_DURATION_OPTIONS.some((option) => option === settings.defaultDurationSeconds)
        ? settings.defaultDurationSeconds
        : MAIN_PAGE_DURATION_OPTIONS[0];
      setDuration(nextDuration);
    }
    const initialLanguages = normalizeLanguageList((settings as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
    setLanguages(initialLanguages);
    const storedVoices = normalizeLanguageVoiceMap((settings as any)?.languageVoicePreferences ?? null);
    setLanguageVoices(storedVoices);
    setInitedFromSettings(true);
  }, [settings, initedFromSettings]);

  useEffect(() => {
    if (!toolPrefillReady || !pendingToolPrefill) return;
    if (authStatus === 'loading') return;
    if (settings && !initedFromSettings) return;

    applyToolPrefill(pendingToolPrefill);
    if (authStatus === 'authenticated') {
      clearStoredToolPrefill();
    }
    setPendingToolPrefill(null);
  }, [applyToolPrefill, authStatus, initedFromSettings, pendingToolPrefill, settings, toolPrefillReady]);

  useEffect(() => {
    if (!settings) return;
    const nextMap = normalizeLanguageVoiceMap((settings as any)?.languageVoicePreferences ?? null);
    setLanguageVoices((prev) => {
      const prevSerialized = JSON.stringify(prev);
      const nextSerialized = JSON.stringify(nextMap);
      return prevSerialized === nextSerialized ? prev : nextMap;
    });
  }, [settings, settings?.languageVoicePreferences]);

  const handleVoiceButtonClick = useCallback((language: TargetLanguageCode) => {
    setVoicePickerLanguage(language);
    setVoicePickerOpen(true);
  }, []);

  const handleVoiceDialogOpenChange = useCallback((next: boolean) => {
    if (!next) {
      setVoicePickerOpen(false);
      setVoicePickerLanguage(null);
    }
  }, []);

  const handleVoiceDialogSelect = useCallback(async (voiceId: string | null) => {
    if (!voicePickerLanguage) return;
    const language = voicePickerLanguage;
    const previous = languageVoices;
    const nextMap: LanguageVoiceMap = { ...languageVoices };
    if (voiceId) {
      nextMap[language] = voiceId;
    } else {
      delete nextMap[language];
    }
    setLanguageVoices(nextMap);
    const normalized = normalizeLanguageVoiceMap(nextMap);
    try {
      await update('languageVoicePreferences' as any, normalized as any);
      setVoicePickerOpen(false);
      setVoicePickerLanguage(null);
    } catch (err) {
      console.error('Failed to save voice preference', err);
      setLanguageVoices(previous);
      toast.error('Failed to save voice preference');
    }
  }, [languageVoices, update, voicePickerLanguage]);

  useEffect(() => {
    const next = snapshotToSelection(settings?.characterSelection);
    setSelection((prev) => {
      if (!next && !prev) return prev;
      if (next && prev && next.variationId === prev.variationId && next.source === prev.source && next.status === prev.status && next.imageUrl === prev.imageUrl) {
        return prev;
      }
      return next;
    });
  }, [settings?.characterSelection]);

  const handleCharacterPersist = useMemo(() => {
    return async (next: CharacterSelection | null) => {
      try {
        if (!next) {
          await update('characterSelection' as any, null as any);
          return;
        }
        const source = next.source ?? 'global';
        const payload: any = { source };
        if (source !== 'dynamic') {
          if (!next.variationId) {
            toast.error('Unable to save character preference');
            return;
          }
          payload.variationId = next.variationId;
        }
        if (source === 'global' && next.characterId) {
          payload.characterId = next.characterId;
        }
        if (source === 'user' && next.userCharacterId) {
          payload.userCharacterId = next.userCharacterId;
        }
        await update('characterSelection' as any, payload);
      } catch (err: any) {
        console.error('Failed to update character selection', err);
        toast.error('Failed to save character preference');
      }
    };
  }, [update]);

  const primaryLanguage = resolvePrimaryLanguage(languages, DEFAULT_LANGUAGE);
  const isImageMode = projectType === 'image';
  const languageMultiplier = Math.max(languages.length, 1);
  const minimumSeconds = tokenSummary?.minimumProjectSeconds ?? TOKEN_COSTS.minimumProjectSeconds;
  const effectiveDuration = useExact ? minimumSeconds : duration;
  const baseSeconds = Math.max(effectiveDuration, minimumSeconds);
  const perSecondCost = tokenSummary?.perSecondProject ?? TOKEN_COSTS.perSecondProject;
  const imageGenerationCost = tokenSummary?.actionCosts?.imageGeneration ?? TOKEN_COSTS.actions.imageGeneration;
  const projectCost = isImageMode
    ? imageGenerationCost
    : baseSeconds * perSecondCost * languageMultiplier;
  const hasTokensForCurrent = tokenBalance >= projectCost;
  const projectCreationDisabled = settings?.projectCreationEnabled === false;
  const projectCreationReason = (settings?.projectCreationDisabledReason || '').trim();
  const displayedProjectCreationReason = projectCreationReason || copy.creationDisabledNoReason;
  const showLowBalanceWarning = tokenBalance <= projectCost;
  const isEnglish = language === 'en';
  const subscriptionPlans = getSubscriptionPlansForUi();
  const activePlanKey: SubscriptionPlanKey | null = subscriptionStatus?.active
    ? (subscriptionPlans.find((plan) => plan.productId === subscriptionStatus.productId)?.planKey ?? null)
    : null;

  const openSubscriptionCheckout = useCallback(async (plan: SubscriptionPlanKey) => {
    setCheckoutPlan(plan);
    try {
      const result = await Api.createSubscriptionCheckout(plan);
      if (result.action === 'checkout') {
        window.location.href = result.url;
      } else if (result.action === 'already_on_plan') {
        toast.info(copy.paywallCurrentPlan);
      } else {
        toast.success('Subscription updated.');
        const nextStatus = await Api.getSubscriptionStatus().catch(() => null);
        if (nextStatus) setSubscriptionStatus(nextStatus);
      }
    } catch (error) {
      void error;
    } finally {
      setCheckoutPlan(null);
    }
  }, [copy.paywallCurrentPlan]);

  useEffect(() => {
    if (shutdownDate || !isEnglish || !paywallOpen) return;
    let cancelled = false;
    void Api.getSubscriptionStatus()
      .then((status) => {
        if (!cancelled) setSubscriptionStatus(status);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isEnglish, paywallOpen, shutdownDate]);

  const templateCustomData = templateSelection?.customData ?? null;

  const effectiveLanguageVoiceProviders = useMemo(() => {
    const providers: Record<string, string | null> = {};
    for (const languageCode of languages) {
      const explicit = languageVoices[languageCode] ?? null;
      const voiceOption = explicit ? getByExternalId(explicit) : (autoVoices[languageCode] ?? null);
      providers[languageCode] = voiceOption?.voiceProvider ?? null;
    }
    return providers;
  }, [autoVoices, getByExternalId, languageVoices, languages]);

  const projectStateValidation = useMemo(() => {
    if (isImageMode) {
      return {
        issues: [],
        disabled: {
          submit: text.trim().length === 0,
          characters: false,
          autoApproveScript: false,
          autoApproveAudio: false,
        },
        fieldErrors: {},
      };
    }
    return validateProjectState({
      mode: useExact ? 'script' : 'idea',
      text,
      enabledLanguages: languages,
      languageVoiceProvidersByLanguage: effectiveLanguageVoiceProviders,
      templateCustomData,
      limits: {
        inworldExactScriptMax: LIMITS.inworldExactScriptMax,
        minimaxExactScriptMax: LIMITS.minimaxExactScriptMax,
        elevenlabsExactScriptMax: LIMITS.elevenlabsExactScriptMax,
      },
    });
  }, [effectiveLanguageVoiceProviders, isImageMode, languages, templateCustomData, text, useExact]);

  // Indicator on the Character button should show only for non-default selections.
  // Treat 'dynamic' as the default (no indicator).
  const showCharacterIndicator = !projectStateValidation.disabled.characters && !!(selection && selection.source !== 'dynamic');

  const persistLanguages = useCallback((codes: TargetLanguageCode[]) => {
    const normalizedNext = normalizeLanguageList(codes, DEFAULT_LANGUAGE);
    const currentStored = normalizeLanguageList((settings as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
    if (languagesEqual(currentStored, normalizedNext)) {
      return Promise.resolve();
    }
    return update('targetLanguages' as any, normalizedNext as any).then(() => undefined);
  }, [settings, update]);

  async function submit() {
    if (submitting) return;
    if (projectCreationDisabled) {
      toast.error(copy.creationDisabledTitle, {
        description: `${copy.creationDisabledDescription} ${copy.creationDisabledReasonLabel}: ${displayedProjectCreationReason}`,
        duration: 8000,
      });
      return;
    }
    if (projectStateValidation.disabled.submit) return;
    const trimmed = text.trim();
    const sanitizedLanguageVoices = normalizeLanguageVoiceMap(languageVoices);
    const apiLanguageVoices = extractExplicitLanguageVoices(sanitizedLanguageVoices);
    const settingsSnapshot = {
      includeDefaultMusic: settings?.includeDefaultMusic ?? true,
      addOverlay: settings?.addOverlay ?? true,
      includeCallToAction: settings?.includeCallToAction ?? true,
      autoApproveScript: settings?.autoApproveScript ?? true,
      autoApproveAudio: settings?.autoApproveAudio ?? true,
      watermarkEnabled: settings?.watermarkEnabled ?? true,
      captionsEnabled: settings?.captionsEnabled ?? true,
      targetLanguages: languages,
      scriptCreationGuidanceEnabled: !!settings?.scriptCreationGuidanceEnabled,
      scriptCreationGuidance: settings?.scriptCreationGuidance ?? '',
      scriptAvoidanceGuidanceEnabled: !!settings?.scriptAvoidanceGuidanceEnabled,
      scriptAvoidanceGuidance: settings?.scriptAvoidanceGuidance ?? '',
      audioStyleGuidanceEnabled: !!settings?.audioStyleGuidanceEnabled,
      audioStyleGuidance: settings?.audioStyleGuidance ?? '',
      languageVoicePreferences: sanitizedLanguageVoices,
    } satisfies PendingProjectDraft['settings'];

    const buildAttemptPayload = (result: 'paywall_shown' | 'draft_created', clientAttemptId = createProjectAttemptClientId()) => ({
      ...collectProjectAttemptContext({
        sourceToolSlug,
        mainPageMode: isImageMode ? 'image' : 'stories',
        templateId: templateSelection?.type === 'custom' ? templateSelection.id : null,
      }),
      clientAttemptId,
      result,
      promptText: trimmed,
      promptMode: isImageMode ? 'idea' as const : (useExact ? 'script' as const : 'idea' as const),
      projectExperience: isImageMode ? 'image-generation' as const : 'story' as const,
      durationSeconds: isImageMode ? null : (useExact ? null : duration),
      tokenCost: projectCost,
      tokenBalance,
      languageCodes: isImageMode ? [] : [...languages],
      languageVoices: isImageMode ? {} : sanitizedLanguageVoices,
      settingsSnapshot,
    });

    if (!hasTokensForCurrent) {
      if (isEnglish) {
        if (tokensLoading) return;
        if (!shutdownDate) await recordProjectCreationAttemptFromClient(buildAttemptPayload('paywall_shown'));
        setPaywallOpen(true);
        return;
      }
      if (typeof window !== 'undefined') {
        const { toast } = await import('sonner');
        toast.error(copy.notEnoughTokensTitle, {
          description: copy.notEnoughTokensDescription(projectCost, tokenBalance),
          duration: 8000,
        });
      }
      return;
    }
    setSubmitting(true);
    const recordedAttempt = await recordProjectCreationAttemptFromClient(buildAttemptPayload('draft_created'));
    const creationAttemptId = recordedAttempt?.id ?? null;
    if (isImageMode) {
      const payload: PendingProjectDraft['payload'] = {
        prompt: trimmed,
        projectExperience: 'image-generation',
      };
      if (creationAttemptId) {
        payload.creationAttemptId = creationAttemptId;
      }
      const allowImageCharacter = selection && selection.source !== 'dynamic' && selection.variationId;
      if (allowImageCharacter) {
        payload.characterSelection = {
          variationId: selection.variationId,
          ...(selection.characterId ? { characterId: selection.characterId } : {}),
          ...(selection.userCharacterId ? { userCharacterId: selection.userCharacterId } : {}),
        };
        if (selection.status) {
          payload.customImageStatus = selection.status;
        }
      }

      const draftId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);

      const draft: PendingProjectDraft = {
        id: draftId,
        creationAttemptId,
        createdAt: new Date().toISOString(),
        text: trimmed,
        useExact: false,
        groupMode: false,
        mode: 'idea',
        durationSeconds: null,
        effectiveDurationSeconds: 0,
        languageCode: primaryLanguage,
        languageCodes: [primaryLanguage],
        languageVoices: {},
        tokenCost: projectCost,
        tokenBalance,
        hasEnoughTokens: hasTokensForCurrent,
        outputType: 'image',
        settings: settingsSnapshot,
        voiceId: null,
        character: allowImageCharacter ? {
          characterId: selection.characterId ?? undefined,
          userCharacterId: selection.userCharacterId ?? undefined,
          variationId: selection.variationId ?? undefined,
          characterTitle: selection.characterTitle ?? undefined,
          variationTitle: selection.variationTitle ?? undefined,
          source: selection.source ?? 'global',
          imageUrl: selection.imageUrl ?? null,
        } : null,
        template: null,
        payload,
      };

      try {
        storeProjectDraft(draft);
        router.push(`/create/confirm/${draftId}`);
      } catch (error) {
        console.error('Failed to initialize image confirmation flow', error);
        setSubmitting(false);
      }
      return;
    }
    const payload: PendingProjectDraft['payload'] = {
      useExactTextAsScript: useExact,
      projectExperience: 'story',
    };
    if (creationAttemptId) {
      payload.creationAttemptId = creationAttemptId;
    }
    if (useExact) {
      payload.rawScript = trimmed;
    } else {
      payload.prompt = trimmed;
      payload.durationSeconds = duration;
    }
    // Prefer the voice the user explicitly chose over the template default
    // Ignore template voice completely; only use explicit user selection or default
    const effectiveVoiceId = settings?.preferredVoiceId || defaultVoiceId || null;
    if (effectiveVoiceId && Object.keys(sanitizedLanguageVoices).length === 0) {
      payload.voiceId = effectiveVoiceId;
    }

    const allowCharacters = !projectStateValidation.disabled.characters;
    if (allowCharacters) {
      if (selection?.source === 'dynamic') {
        payload.characterSelection = { source: 'dynamic' } as any;
        payload.customImageStatus = 'processing';
      } else if (selection?.variationId) {
        payload.characterSelection = {
          variationId: selection.variationId,
          ...(selection.characterId ? { characterId: selection.characterId } : {}),
          ...(selection.userCharacterId ? { userCharacterId: selection.userCharacterId } : {}),
        };
        if (selection.status) {
          payload.customImageStatus = selection.status;
        }
      }
    }
    if (templateSelection?.type === 'custom') {
      payload.templateId = templateSelection.id;
    }
    payload.languages = [...languages];
    if (Object.keys(apiLanguageVoices).length > 0) {
      payload.languageVoices = apiLanguageVoices;
    }

    const draftId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

    const draft: PendingProjectDraft = {
      id: draftId,
      creationAttemptId,
      createdAt: new Date().toISOString(),
      text: trimmed,
      useExact,
      groupMode,
      mode: useExact ? 'script' : 'idea',
      durationSeconds: useExact ? null : duration,
      effectiveDurationSeconds: Math.max(duration, tokenSummary?.minimumProjectSeconds ?? TOKEN_COSTS.minimumProjectSeconds),
      languageCode: primaryLanguage,
      languageCodes: [...languages],
      languageVoices: sanitizedLanguageVoices,
      tokenCost: projectCost,
      tokenBalance,
      hasEnoughTokens: hasTokensForCurrent,
      settings: settingsSnapshot,
      voiceId: effectiveVoiceId,
      character: allowCharacters && selection ? {
        characterId: selection.characterId ?? undefined,
        userCharacterId: selection.userCharacterId ?? undefined,
        variationId: selection.variationId ?? undefined,
        characterTitle: selection.characterTitle ?? undefined,
        variationTitle: selection.variationTitle ?? undefined,
        source: selection.source ?? 'global',
        imageUrl: selection.imageUrl ?? null,
      } : null,
      template: templateSelection?.type === 'custom' ? {
        id: templateSelection.id,
        title: templateSelection.title,
        description: templateSelection.description,
        previewImageUrl: templateSelection.previewImageUrl,
        previewVideoUrl: templateSelection.previewVideoUrl,
      } : null,
      payload,
    };

    try {
      storeProjectDraft(draft);
      router.push(`/create/confirm/${draftId}`);
    } catch (error) {
      console.error('Failed to initialize project confirmation flow', error);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-2 sm:px-0">
      <div className="p-0">
        <div className="mb-3">
          <h1 className="text-pretty text-center font-semibold tracking-normal text-gray-900 dark:text-gray-100 sm:text-[32px] md:text-[46px] text-[29px]">{isImageMode ? copy.headingImage : copy.heading}</h1>
          <p className="mt-1 mb-6 text-center text-[clamp(12px,3.5vw,20px)] sm:text-[20px] text-gray-600 dark:text-gray-300 whitespace-normal text-pretty leading-tight tracking-normal">{isImageMode ? copy.subtitleImage : copy.subtitle}</p>
        </div>
        {/* Unified input container: textarea on top, control bar at bottom; same visual block */}
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-800">
          <Textarea
            className="min-h-[140px] sm:min-h-[180px] w-full resize-none border-0 bg-transparent p-4 pr-4 text-sm leading-relaxed focus-visible:ring-0 focus-visible:outline-none"
            placeholder={isImageMode ? copy.imagePlaceholder : (placeholder || copy.placeholder)}
            disabled={projectCreationDisabled}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next.length > LIMITS.promptMax ? next.slice(0, LIMITS.promptMax) : next);
            }}
            onKeyDown={(e) => {
              if (!submitting && !projectCreationDisabled && !projectStateValidation.disabled.submit && (e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim()) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {projectCreationDisabled ? (
            <div className="mx-4 mb-3 mt-2 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1 text-xs leading-5">
                <p>{copy.creationDisabledDescription}</p>
                <p className="text-amber-800/90 dark:text-amber-200/90">
                  {copy.creationDisabledReasonLabel}: {displayedProjectCreationReason}
                </p>
              </div>
            </div>
          ) : null}
          {projectStateValidation.fieldErrors.text ? (
            <div className="mt-2 px-4 pb-1 text-sm text-rose-700 dark:text-rose-200">
              {projectStateValidation.fieldErrors.text}
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-2 sm:px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Vertical format indicator (9:16), left-most */}
              {!isImageMode ? (
              <Tooltip content={copy.verticalFormat}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 cursor-pointer rounded-full border-blue-200 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40"
                  aria-label={copy.verticalFormat}
                  aria-pressed="true"
                  aria-disabled="true"
                  onClick={(e) => e.preventDefault()}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </Tooltip>
              ) : null}
              {/**
               * Group creation button (hidden)
               * ------------------------------------------------------------
               * The group creation flow is implemented, but the entry point
               * UI is intentionally hidden for now. If you want to expose
               * the "Create as group" control again, uncomment the block
               * below as-is.
               *
               * <Tooltip content={groupMode ? 'Will create a group with these settings' : 'Create as group'}>
               *   <Button
               *     type="button"
               *     variant="outline"
               *     size="icon"
               *     className={
               *       'h-8 w-8 rounded-full ' +
               *       (groupMode ? 'border-emerald-200 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : '')
               *     }
               *     aria-pressed={groupMode}
               *     aria-label="Group mode"
               *     onClick={() => setGroupMode((v) => !v)}
               *   >
               *     <Layers className="h-4 w-4" />
               *   </Button>
               * </Tooltip>
               */}
              {!isImageMode ? (
              <Popover>
                <Tooltip content={copy.settings}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="relative inline-grid cursor-pointer place-items-center rounded-full p-0 leading-none"
                      aria-label={copy.settings}
                    >
                      <Settings className="h-4 w-4" />
                      {showSettingsDot && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-950" />
                      )}
                    </Button>
                  </PopoverTrigger>
                </Tooltip>
	                <PopoverContent side="bottom" align="start" className="w-[min(320px,calc(100vw-1rem))] sm:w-[320px]">
	                  <SettingsPopover disabledAutoApprove={projectStateValidation.disabled.autoApproveScript || projectStateValidation.disabled.autoApproveAudio} />
	                </PopoverContent>
	              </Popover>
              ) : null}
              {!isImageMode ? (
              <DurationDropdown
                value={duration}
                options={[...MAIN_PAGE_DURATION_OPTIONS]}
                customLabels={MAIN_PAGE_DURATION_LABELS}
                onChange={(v) => {
                  setDuration(v);
                  // Persist as global default timing
                  update('defaultDurationSeconds' as any, v as any);
                }}
                disabled={useExact}
              />
              ) : null}
              {!isImageMode ? (
              <LanguageDropdown
                values={languages}
                onChange={(codes) => {
                  setLanguages(codes);
                  persistLanguages(codes)?.catch((err) => {
                    console.error('Failed to persist language selection', err);
                  });
                }}
                languageVoices={languageVoices}
                onVoiceClick={handleVoiceButtonClick}
                resolveVoiceOption={getByExternalId}
                autoVoices={autoVoices}
                voiceModalOpen={voicePickerOpen}
              />
              ) : null}
              <Tooltip content={copy.chooseCharacter}>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative cursor-pointer rounded-full"
                  onClick={() => setCharOpen(true)}
                  disabled={!isImageMode && projectStateValidation.disabled.characters}
                >
                  <User className="mr-2 h-4 w-4" />
                  {copy.character}
                  {showCharacterIndicator ? (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-950" />
                  ) : null}
                </Button>
              </Tooltip>
              {!isImageMode ? (
              <Tooltip content={useExact ? copy.modeScriptTooltip : copy.modeIdeaTooltip}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    'cursor-pointer rounded-full pl-2 pr-3 ' +
                    (useExact
                      ? 'border-blue-200 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40'
                      : '')
                  }
                  disabled={savingUseExact}
                  aria-busy={savingUseExact}
                  aria-pressed={useExact}
                  onClick={async () => {
                    if (savingUseExact) return;
                    const next = !useExact;
                    setUseExact(next);
                    setSavingUseExact(true);
                    try {
                      await update('defaultUseScript' as any, next as any);
                    } finally {
                      setSavingUseExact(false);
                    }
                  }}
                >
                  <span className="mr-2 inline-flex items-center justify-center">
                    {useExact ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <Lightbulb className="h-4 w-4" />
                    )}
                  </span>
                  {useExact ? copy.modeScript : copy.modeIdea}
                </Button>
              </Tooltip>
              ) : null}
            </div>
            <Button
              type="button"
              className="w-full cursor-pointer sm:w-9 sm:h-9 sm:px-0 sm:rounded-full"
              onClick={submit}
              disabled={
                !text.trim() ||
                submitting ||
                projectStateValidation.disabled.submit ||
                projectCreationDisabled ||
                (!isEnglish && !tokensLoading && !hasTokensForCurrent)
              }
              aria-label={isImageMode ? copy.createImageProject : copy.createProject}
              title={isImageMode ? copy.createImageProject : copy.createProject}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              <span className="ml-2 sm:hidden">{isImageMode ? copy.createImageProject : copy.create}</span>
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {/* Character and exact script controls moved into the textarea control bar above */}
        </div>
        {(!isImageMode && !isEnglish && !tokensLoading && tokenSummary && showLowBalanceWarning) && (
          <TokenLowBalanceAlert
            language={language}
            buyTokensLabel={copy.buyTokens}
            tokenWarning={copy.tokenWarning}
            projectCost={projectCost}
            tokenBalance={tokenBalance}
            effectiveDuration={effectiveDuration}
            minimumProjectSeconds={tokenSummary.minimumProjectSeconds}
            useExact={useExact}
          />
        )}
      </div>
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} cost={projectCost} balance={tokenBalance}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl p-0" ariaDescription={copy.paywallDescription(projectCost, tokenBalance)}>
          <div className="p-4 sm:p-6">
            <DialogHeader className="mb-2 block space-y-2">
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
                <Crown className="h-5 w-5 text-amber-500" />
                <span>{copy.paywallTitle}</span>
              </DialogTitle>
              <DialogDescription>{copy.paywallDescription(projectCost, tokenBalance)}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subscriptionPlans.map((plan) => {
                const isLoading = checkoutPlan === plan.planKey;
                const perLabel = plan.interval === 'week' ? copy.paywallWeekLabel : copy.paywallMonthLabel;
                const isCurrentPlan = activePlanKey === plan.planKey;
                const isPopular = Boolean(plan.ui.benefits.some((benefit) => benefit.key === 'most_popular'));
                const canChoose = !isCurrentPlan;
                return (
                  <div
                    key={plan.planKey}
                    className={[
                      'flex flex-col rounded-xl border p-4 sm:p-5',
                      isPopular
                        ? 'border-blue-300 bg-blue-50/40 shadow-sm dark:border-blue-800 dark:bg-blue-950/20'
                        : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-center gap-2">
                      <span className="inline-flex items-end gap-1 text-gray-900 dark:text-gray-100">
                        <span className="text-4xl font-extrabold leading-none">${plan.priceUsd.toFixed(2)}</span>
                        <span className="pb-0.5 text-sm font-medium text-gray-500 dark:text-gray-400">/{perLabel}</span>
                      </span>
                    </div>
                    <div className="mt-4 flex-1 space-y-2 rounded-lg border border-gray-200/80 bg-white/70 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-300">
                      {plan.ui.benefits.map((benefit, benefitIndex) => {
                        if (benefit.key === 'images_per_period' && typeof benefit.images === 'number' && benefit.interval) {
                          return (
                            <p key={`${plan.planKey}-benefit-${benefitIndex}`} className="flex items-center gap-2">
                              <Images className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                              <span>{copy.paywallImagesPerPeriod(benefit.images.toLocaleString(), benefit.interval)}</span>
                            </p>
                          );
                        }
                        if (benefit.key === 'videos_per_period' && typeof benefit.videos === 'number' && benefit.interval) {
                          return (
                            <p key={`${plan.planKey}-benefit-${benefitIndex}`} className="flex items-center gap-2">
                              <Video className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                              <span>{copy.paywallVideosPerPeriod(formatSubscriptionVideoCountForPaywall(benefit.videos), benefit.interval)}</span>
                            </p>
                          );
                        }
                        if (benefit.key === 'tokens_per_charge' && typeof benefit.tokens === 'number') {
                          return (
                            <p key={`${plan.planKey}-benefit-${benefitIndex}`} className="flex items-center gap-2">
                              <Coins className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                              <span>{benefit.tokens.toLocaleString()} {copy.paywallPerCharge}</span>
                            </p>
                          );
                        }
                        return null;
                      })}
                    </div>
                    <Button
                      className="mt-4 w-full"
                      onClick={() => void openSubscriptionCheckout(plan.planKey)}
                      disabled={checkoutPlan !== null || !canChoose}
                      variant={isCurrentPlan ? 'outline' : 'default'}
                    >
                      {isCurrentPlan ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {copy.paywallCurrentPlan}
                        </>
                      ) : isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {copy.paywallOpeningCheckout}
                        </>
                      ) : canChoose ? (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          {copy.paywallChoosePlan}
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          {copy.paywallUnavailable}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </PaywallDialog>
      {/* Templates picker under textarea & settings */}
      {!isImageMode ? <TemplatePicker onChange={handleTemplateChange} /> : null}

      <CharacterModal
        open={charOpen}
        onClose={() => setCharOpen(false)}
        currentSelection={selection}
      onSelect={async (next) => {
        setSelection(next);
        await handleCharacterPersist(next);
      }}
    />
      <VoicePickerDialog
        open={voicePickerOpen && !!voicePickerLanguage}
        languageCode={voicePickerLanguage}
        onOpenChange={handleVoiceDialogOpenChange}
        selectedVoiceId={
          voicePickerLanguage && languageVoices[voicePickerLanguage]
            ? (getByExternalId(languageVoices[voicePickerLanguage] ?? null)?.externalId ?? null)
            : null
        }
        onSelect={handleVoiceDialogSelect}
      />
    </div>
  );
}
