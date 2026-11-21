"use client";

import { PaywallDialog, useShutdownDate, SignupNotice } from '@/components/providers/ShutdownModeProvider';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { ArrowLeft, Download, Loader2, Settings, Mic, Star, Clapperboard, CreditCard, Crown, Lightbulb, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Api } from '@/lib/api-client';
import { useTokenSummary } from '@/hooks/useTokenSummary';
import { useSettings } from '@/hooks/useSettings';
import { CHARACTER_PROJECT_CREATION_TOKENS, formatSubscriptionVideoCountForPaywall, getSubscriptionPlansForUi, type SubscriptionPlanKey } from '@/shared/constants/subscriptions';
import { Tooltip } from '@/components/common/Tooltip';
import { LanguageDropdown } from '@/components/main/LanguageDropdown';
import { VoicePickerDialog } from '@/components/main/VoicePickerDialog';
import { useVoices } from '@/hooks/useVoices';
import { DEFAULT_LANGUAGE, normalizeLanguageList, resolvePrimaryLanguage, type TargetLanguageCode } from '@/shared/constants/languages';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';
import { normalizeContentTone, type ContentTone } from '@/shared/constants/content-tone';
import { normalizeLanguageVoiceMap } from '@/shared/voices/language-voice-map';
import { voiceSupportsLanguage } from '@/shared/voices/client-utils';
import type { LanguageVoiceMap } from '@/shared/types';
import {
  collectProjectAttemptContext,
  createProjectAttemptClientId,
  recordProjectCreationAttemptFromClient,
} from '@/lib/project-attempts';
import { normalizeCharacterCreationSettings } from '@/shared/constants/character-creation-settings';
import { CHARACTER_PROJECT_TARGET_DURATION_SECONDS } from '@/shared/constants/character-project';
import {
  isVoiceProviderExcludedFromRules,
  VOICE_PROVIDER_AVAILABILITY_RULES,
  type ScriptInputMode,
} from '@/shared/voices/provider-availability-policy';
import {
  clearStoredToolPrefill,
  readStoredToolPrefill,
  readToolPrefillFromQuery,
  removeToolPrefillQueryParams,
  storeToolPrefill,
  TOOL_PREFILL_MAX_TEXT_CHARS,
  type ToolLandingPrefill,
} from '@/components/main/helpers';
import { CharacterPreviewCard } from './CharacterPreviewCard';
import type { PublicCharacter } from './catalog';
import { CharacterCreationSettingsPopover } from './CharacterCreationSettingsPopover';

const CONTENT_TONE_OPTIONS: Array<{ value: ContentTone; emoji: string }> = [
  { value: 'neutral', emoji: '🙂' },
  { value: 'playful', emoji: '😄' },
  { value: 'angry', emoji: '😡' },
];

type CharacterProfileCopy = {
  defaultBackLabel: string;
  backToCategoryAria: (label: string) => string;
  addFavoriteAria: string;
  removeFavoriteAria: string;
  defaultPromptPlaceholder: string;
  interactivePrompts: string[];
  scriptPromptTitle: string;
  settingsLabel: string;
  modeScriptTooltip: string;
  modeIdeaTooltip: string;
  modeScript: string;
  modeIdea: string;
  toneLabels: Record<ContentTone, string>;
  voiceFallbackAuto: string;
  voiceFallbackCustom: string;
  createVideo: string;
  downloadInlineTitle: (name: string) => string;
  downloadInlineDescription: string;
  downloadButton: string;
  downloadCharacterAria: (name: string) => string;
  authRequiredTitle: string;
  authRequiredDescription: string;
  continueWithGoogle: string;
  continueWithApple: string;
  signingIn: string;
  confirmProjectCreationTitle: string;
  confirmWithdrawIntro: string;
  confirmWithdrawOutro: string;
  confirmBalanceLabel: string;
  confirmBalanceOutro: string;
  cancel: string;
  confirmAndCreate: string;
  toastFavoriteUpdateFailed: string;
  toastLanguageSaveFailed: string;
  toastVoiceSaveFailed: string;
  toastModeSaveFailed: string;
  toastToneSaveFailed: string;
  toastCreateProjectFailed: string;
  toastDownloadCharacterFailed: string;
  toastPlanAlreadyActive: string;
  toastSubscriptionUpdated: string;
  toastOpenCheckoutFailed: string;
  topUpTitle: string;
  topUpDescription: string;
  paywallCurrentBalance: (balance: number) => string;
  tokensPerCharge: string;
  imagesPerPeriod: (images: string, period: 'week' | 'month') => string;
  videosPerPeriod: (videos: string, period: 'week' | 'month') => string;
  paywallPerPeriod: (period: 'week' | 'month') => string;
  paywallChipLabel: (planKey: SubscriptionPlanKey) => string;
  paywallSubscribeWithPrice: (amount: string, periodLabel: string) => string;
  openingCheckout: string;
  subscribe: string;
  guestDownloadTitle: (name: string) => string;
  guestDownloadDescription: string;
};

const COPY: Record<AppLanguageCode, CharacterProfileCopy> = {
  en: {
    defaultBackLabel: 'Categories',
    backToCategoryAria: (label) => `Back to ${label}`,
    addFavoriteAria: 'Add favorite',
    removeFavoriteAria: 'Remove favorite',
    defaultPromptPlaceholder: 'Describe your concept, tone, and what this character should say on screen.',
    interactivePrompts: [
      'Tell a story about a birthday surprise that goes wrong in a funny way.',
      'Explain why everyone is talking about a new trend in simple words.',
      'React to finding out your best friend won the lottery.',
      'Share a hot take about working from home vs office work.',
      'Give three quick tips for surviving a very bad Monday.',
      'Tell a short mystery story about a missing phone at a party.',
      'Describe a first date disaster that becomes a happy ending.',
      'Announce big news and end with a strong punchline.',
    ],
    scriptPromptTitle: 'What should this character do on screen?',
    settingsLabel: 'Settings',
    modeScriptTooltip: 'Now in Script mode. Character reads your text. Tap for Idea mode.',
    modeIdeaTooltip: 'Now in Idea mode. AI will write text. Tap for Script mode.',
    modeScript: 'Script',
    modeIdea: 'Idea',
    toneLabels: {
      neutral: 'Normal',
      playful: 'Playful',
      angry: 'Angry',
    },
    voiceFallbackAuto: 'Auto',
    voiceFallbackCustom: 'Custom voice',
    createVideo: 'Create Video',
    downloadInlineTitle: (name) => `Download ${name} image`,
    downloadInlineDescription: 'Save this character image for your own drafts, references, or social content. You can download it any time.',
    downloadButton: 'Download Character',
    downloadCharacterAria: (name) => `Download ${name} character image`,
    authRequiredTitle: 'Sign in required',
    authRequiredDescription: 'Sign in with Google or Apple when you are ready to create videos from this character.',
    continueWithGoogle: 'Continue with Google',
    continueWithApple: 'Continue with Apple',
    signingIn: 'Signing in...',
    confirmProjectCreationTitle: 'Confirm project creation',
    confirmWithdrawIntro: 'This action will withdraw',
    confirmWithdrawOutro: 'tokens to start generating your character video.',
    confirmBalanceLabel: 'Balance after creation:',
    confirmBalanceOutro: 'tokens.',
    cancel: 'Cancel',
    confirmAndCreate: 'Confirm and create',
    toastFavoriteUpdateFailed: 'Failed to update favorite',
    toastLanguageSaveFailed: 'Failed to save language preference',
    toastVoiceSaveFailed: 'Failed to save voice preference',
    toastModeSaveFailed: 'Failed to save mode preference',
    toastToneSaveFailed: 'Failed to save emotion preference',
    toastCreateProjectFailed: 'Failed to create character project',
    toastDownloadCharacterFailed: 'Failed to download character image',
    toastPlanAlreadyActive: 'This plan is already active.',
    toastSubscriptionUpdated: 'Subscription updated.',
    toastOpenCheckoutFailed: 'Failed to open checkout',
    topUpTitle: 'Top up with subscription',
    topUpDescription: 'Subscribe to automatically get more tokens after each successful charge.',
    paywallCurrentBalance: (currentBalance) => `Current balance: ${currentBalance.toLocaleString()} tokens.`,
    tokensPerCharge: 'tokens per charge',
    imagesPerPeriod: (images, period) => `${images} images/${period}`,
    videosPerPeriod: (videos, period) => `${videos} videos/${period}`,
    paywallPerPeriod: (period) => period,
    paywallChipLabel: (planKey) => {
      if (planKey === 'weekly') return 'Just to try';
      if (planKey === 'monthly') return 'Most popular';
      return 'Best choice';
    },
    paywallSubscribeWithPrice: (amount, periodLabel) => `Subscribe • ${amount}/${periodLabel}`,
    openingCheckout: 'Opening checkout...',
    subscribe: 'Subscribe',
    guestDownloadTitle: (name) => `Free ${name} character download`,
    guestDownloadDescription: 'You can use this character for your videos, posts, and creative projects at no cost. Click download to save the image and use it wherever you want.',
  },
  ru: {
    defaultBackLabel: 'Категории',
    backToCategoryAria: (label) => `Назад к: ${label}`,
    addFavoriteAria: 'Добавить в избранное',
    removeFavoriteAria: 'Убрать из избранного',
    defaultPromptPlaceholder: 'Опишите идею, тон и то, что этот персонаж должен сказать в кадре.',
    interactivePrompts: [
      'Расскажи историю про день рождения, где сюрприз пошёл совсем не по плану.',
      'Объясни простыми словами, почему все вдруг обсуждают этот тренд.',
      'Сыграй реакцию на новость: твой лучший друг выиграл в лотерею.',
      'Выскажи смелое мнение: работать дома лучше или в офисе?',
      'Дай три коротких совета, как пережить тяжёлый понедельник.',
      'Расскажи мини-детектив о пропавшем телефоне на вечеринке.',
      'Опиши неудачное первое свидание, которое неожиданно закончилось хорошо.',
      'Объяви важную новость и заверши фразой, которая запомнится.',
    ],
    scriptPromptTitle: 'Что должен делать персонаж на видео?',
    settingsLabel: 'Настройки',
    modeScriptTooltip: 'Сейчас режим сценария. Персонаж озвучивает ваш текст. Нажмите для режима идеи.',
    modeIdeaTooltip: 'Сейчас режим идеи. ИИ напишет текст. Нажмите для режима сценария.',
    modeScript: 'Сценарий',
    modeIdea: 'Идея',
    toneLabels: {
      neutral: 'Нормальный',
      playful: 'Игривый',
      angry: 'Злой',
    },
    voiceFallbackAuto: 'Авто',
    voiceFallbackCustom: 'Свой голос',
    createVideo: 'Создать видео',
    downloadInlineTitle: (name) => `Скачать изображение ${name}`,
    downloadInlineDescription: 'Сохраните изображение персонажа для своих черновиков, референсов или соцсетей. Скачать можно в любое время.',
    downloadButton: 'Скачать персонажа',
    downloadCharacterAria: (name) => `Скачать изображение персонажа ${name}`,
    authRequiredTitle: 'Требуется вход',
    authRequiredDescription: 'Войдите через Google или Apple, когда будете готовы создавать видео с этим персонажем.',
    continueWithGoogle: 'Продолжить с Google',
    continueWithApple: 'Продолжить с Apple',
    signingIn: 'Выполняем вход...',
    confirmProjectCreationTitle: 'Подтвердите создание проекта',
    confirmWithdrawIntro: 'Будет списано',
    confirmWithdrawOutro: 'токенов для запуска генерации видео с персонажем.',
    confirmBalanceLabel: 'Баланс после создания:',
    confirmBalanceOutro: 'токенов.',
    cancel: 'Отмена',
    confirmAndCreate: 'Подтвердить и создать',
    toastFavoriteUpdateFailed: 'Не удалось обновить избранное',
    toastLanguageSaveFailed: 'Не удалось сохранить язык',
    toastVoiceSaveFailed: 'Не удалось сохранить голос',
    toastModeSaveFailed: 'Не удалось сохранить режим',
    toastToneSaveFailed: 'Не удалось сохранить эмоцию',
    toastCreateProjectFailed: 'Не удалось создать проект с персонажем',
    toastDownloadCharacterFailed: 'Не удалось скачать изображение персонажа',
    toastPlanAlreadyActive: 'Этот план уже активен.',
    toastSubscriptionUpdated: 'Подписка обновлена.',
    toastOpenCheckoutFailed: 'Не удалось открыть оплату',
    topUpTitle: 'Пополнение через подписку',
    topUpDescription: 'Оформите подписку, чтобы автоматически получать токены после каждого успешного списания.',
    paywallCurrentBalance: (currentBalance) => `Текущий баланс: ${currentBalance.toLocaleString()} токенов.`,
    tokensPerCharge: 'токенов за списание',
    imagesPerPeriod: (images, period) => `${images} изображений/${period === 'week' ? 'неделю' : 'месяц'}`,
    videosPerPeriod: (videos, period) => `${videos} видео/${period === 'week' ? 'неделю' : 'месяц'}`,
    paywallPerPeriod: (period) => (period === 'week' ? 'неделю' : 'месяц'),
    paywallChipLabel: (planKey) => {
      if (planKey === 'weekly') return 'Просто попробовать';
      if (planKey === 'monthly') return 'Самый популярный';
      return 'Лучший выбор';
    },
    paywallSubscribeWithPrice: (amount, periodLabel) => `Подписаться • ${amount}/${periodLabel}`,
    openingCheckout: 'Открываем оплату...',
    subscribe: 'Подписаться',
    guestDownloadTitle: (name) => `Бесплатная загрузка персонажа ${name}`,
    guestDownloadDescription: 'Вы можете использовать этого персонажа в своих видео, постах и креативных проектах бесплатно. Нажмите «Скачать», чтобы сохранить изображение и использовать где угодно.',
  },
};

function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'character';
}

function getFileExtensionFromUrl(url: string): string {
  const clean = url.split('?')[0]?.split('#')[0] ?? '';
  const lastSegment = clean.split('/').pop() ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return 'png';
  const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
  return /^[a-z0-9]+$/.test(extension) ? extension : 'png';
}

export function CharacterProfilePage({
  character,
  backCategoryId = null,
  backCategoryLabel = null,
  initialIsAuthenticated = false,
  initialIsFavorited = false,
  initialFavoritesCount = 0,
  initialCreationsCount = 0,
}: {
  character: PublicCharacter;
  backCategoryId?: string | null;
  backCategoryLabel?: string | null;
  initialIsAuthenticated?: boolean;
  initialIsFavorited?: boolean;
  initialFavoritesCount?: number;
  initialCreationsCount?: number;
}) {
  const { status } = useSession();
  const shutdownDate = useShutdownDate();
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const router = useRouter();
  const { settings, update } = useSettings();
  const { balance } = useTokenSummary();
  const { getByExternalId, autoVoices, providerAvailabilityRules, loading: voicesLoading } = useVoices();
  const [scriptText, setScriptText] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startingProvider, setStartingProvider] = useState<'google' | 'apple' | null>(null);
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState('');
  const [animatedPromptIndex, setAnimatedPromptIndex] = useState(0);
  const [isDeletingPlaceholder, setIsDeletingPlaceholder] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<TargetLanguageCode>(DEFAULT_LANGUAGE);
  const [languageVoices, setLanguageVoices] = useState<LanguageVoiceMap>({});
  const [voicePickerLanguage, setVoicePickerLanguage] = useState<TargetLanguageCode | null>(null);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [useExact, setUseExact] = useState(false);
  const [contentTone, setContentTone] = useState<ContentTone>('neutral');
  const [initedFromSettings, setInitedFromSettings] = useState(false);
  const [pendingToolPrefill, setPendingToolPrefill] = useState<ToolLandingPrefill | null>(null);
  const [toolPrefillReady, setToolPrefillReady] = useState(false);
  const [sourceToolSlug, setSourceToolSlug] = useState<string | null>(null);
  const [favoriteState, setFavoriteState] = useState({
    isFavorited: initialIsFavorited,
    favoritesCount: initialFavoritesCount,
  });
  const [favoriteSubmitting, setFavoriteSubmitting] = useState(false);
  const [favoritePulse, setFavoritePulse] = useState(false);
  const favoriteInitializedRef = useRef(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanKey | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<SubscriptionPlanKey>('monthly');

  const canAttemptCreation = useMemo(() => scriptText.trim().length > 0, [scriptText]);
  const shouldAnimatePlaceholder = !isPromptFocused && scriptText.length === 0;
  const categoriesHref = backCategoryId
    ? `/?openCategory=${encodeURIComponent(backCategoryId)}`
    : '/';
  const backLabel = backCategoryLabel?.trim() || copy.defaultBackLabel;
  const tokenCost = CHARACTER_PROJECT_CREATION_TOKENS;
  const hasEnoughTokens = balance >= tokenCost;
  const projectedBalance = Math.max(balance - tokenCost, 0);
  const normalizedCharacterId = (character.slug ?? character.id).toLowerCase();
  const isCreepyComic = normalizedCharacterId === 'creepy-comic';
  const isAuthenticated = status === 'authenticated'
    ? true
    : status === 'unauthenticated'
      ? false
      : initialIsAuthenticated;
  const showGuestStickyDownloadSection = isCreepyComic && !isAuthenticated;
  const showAuthorizedInlineDownloadSection = isCreepyComic && isAuthenticated;
  const downloadFileName = `${toKebabCase(character.name)}.${getFileExtensionFromUrl(character.previewImageUrl)}`;
  const inputMode: ScriptInputMode = useExact ? 'script' : 'idea';
  const activeProviderRules = providerAvailabilityRules.length > 0
    ? providerAvailabilityRules
    : VOICE_PROVIDER_AVAILABILITY_RULES;
  const selectedVoiceIdFromPrefs = languageVoices[selectedLanguage] ?? null;
  const selectedVoiceFromPrefs = getByExternalId(selectedVoiceIdFromPrefs);
  const selectedVoiceExcluded = !!selectedVoiceFromPrefs && isVoiceProviderExcludedFromRules(
    selectedVoiceFromPrefs.voiceProvider,
    activeProviderRules,
    {
      projectExperience: 'character',
      mode: inputMode,
      languageCode: selectedLanguage,
    },
  );
  const selectedVoiceId = selectedVoiceExcluded ? null : selectedVoiceIdFromPrefs;
  const selectedVoice = selectedVoiceExcluded ? null : selectedVoiceFromPrefs;
  const selectedVoiceLabel = selectedVoice?.title?.trim()
    || (!selectedVoiceId || voicesLoading ? copy.voiceFallbackAuto : copy.voiceFallbackCustom);
  const interactivePrompts = useMemo(
    () => (
      copy.interactivePrompts.length > 0
        ? copy.interactivePrompts
        : [copy.defaultPromptPlaceholder]
    ),
    [copy.defaultPromptPlaceholder, copy.interactivePrompts],
  );
  const subscriptionPlans = getSubscriptionPlansForUi();
  const selectedPlan = subscriptionPlans.find((plan) => plan.planKey === selectedPlanKey) ?? subscriptionPlans[0] ?? null;
  const selectedPerLabel = selectedPlan ? copy.paywallPerPeriod(selectedPlan.interval) : copy.paywallPerPeriod('month');
  const selectedPlanAmount = selectedPlan ? `$${selectedPlan.priceUsd.toFixed(2)}` : '$0.00';

  useEffect(() => {
    if (subscriptionPlans.some((plan) => plan.planKey === selectedPlanKey)) return;
    if (subscriptionPlans[0]) {
      setSelectedPlanKey(subscriptionPlans[0].planKey);
    }
  }, [selectedPlanKey, subscriptionPlans]);

  const applyToolPrefill = useMemo(
    () => (prefill: ToolLandingPrefill) => {
      if (typeof prefill.sourceToolSlug === 'string' && prefill.sourceToolSlug.trim().length > 0) {
        setSourceToolSlug(prefill.sourceToolSlug.trim());
      }

      if (typeof prefill.text === 'string' && prefill.text.trim().length > 0) {
        setScriptText(prefill.text.slice(0, TOOL_PREFILL_MAX_TEXT_CHARS));
      }

      if (Array.isArray(prefill.languages) && prefill.languages.length > 0) {
        const normalized = normalizeLanguageList(prefill.languages, DEFAULT_LANGUAGE);
        setSelectedLanguage(resolvePrimaryLanguage(normalized, DEFAULT_LANGUAGE));
      }

      if (prefill.languageVoices) {
        const normalizedVoiceMap = normalizeLanguageVoiceMap(prefill.languageVoices);
        if (Object.keys(normalizedVoiceMap).length > 0) {
          setLanguageVoices(normalizedVoiceMap);
        }
      }
    },
    [],
  );

  async function onToggleFavorite() {
    if (favoriteSubmitting) return;
    if (status !== 'authenticated') {
      setAuthOpen(true);
      return;
    }

    const nextFavorited = !favoriteState.isFavorited;
    const previous = favoriteState;
    setFavoriteSubmitting(true);
    setFavoriteState({
      isFavorited: nextFavorited,
      favoritesCount: Math.max(previous.favoritesCount + (nextFavorited ? 1 : -1), 0),
    });

    try {
      const response = await fetch(`/api/characters/${encodeURIComponent(character.slug ?? character.id)}/favorite`, {
        method: nextFavorited ? 'POST' : 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Favorite request failed: ${response.status}`);
      }
      const payload = await response.json() as {
        metrics?: {
          favoritesCount?: number;
          isFavorited?: boolean;
        };
      };
      setFavoriteState({
        isFavorited: payload.metrics?.isFavorited ?? nextFavorited,
        favoritesCount: payload.metrics?.favoritesCount ?? previous.favoritesCount,
      });
    } catch (error) {
      console.error('Failed to toggle favorite character', error);
      setFavoriteState(previous);
      toast.error(copy.toastFavoriteUpdateFailed);
    } finally {
      setFavoriteSubmitting(false);
    }
  }

  useEffect(() => {
    if (!favoriteInitializedRef.current) {
      favoriteInitializedRef.current = true;
      return;
    }
    setFavoritePulse(true);
    const timer = setTimeout(() => setFavoritePulse(false), 320);
    return () => clearTimeout(timer);
  }, [favoriteState.isFavorited]);

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
    if (status !== 'authenticated') return;
    clearStoredToolPrefill();
  }, [status]);

  useEffect(() => {
    if (!toolPrefillReady || !pendingToolPrefill) return;
    if (status === 'loading') return;
    if (settings && !initedFromSettings) return;

    applyToolPrefill(pendingToolPrefill);
    if (status === 'authenticated') {
      clearStoredToolPrefill();
    }
    setPendingToolPrefill(null);
  }, [applyToolPrefill, initedFromSettings, pendingToolPrefill, settings, status, toolPrefillReady]);

  useEffect(() => {
    if (!settings || initedFromSettings) return;
    const initialLanguages = normalizeLanguageList((settings as any)?.targetLanguages ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
    setSelectedLanguage(resolvePrimaryLanguage(initialLanguages, DEFAULT_LANGUAGE));
    setLanguageVoices(normalizeLanguageVoiceMap((settings as any)?.languageVoicePreferences ?? null));
    setUseExact(!!(settings as any)?.defaultUseScript);
    setContentTone(normalizeContentTone((settings as any)?.characterContentTone));
    setInitedFromSettings(true);
  }, [initedFromSettings, settings]);

  useEffect(() => {
    if (!selectedVoiceIdFromPrefs) return;
    const preferredVoice = getByExternalId(selectedVoiceIdFromPrefs);
    if (!preferredVoice) return;
    const shouldClear = !voiceSupportsLanguage(preferredVoice, selectedLanguage)
      || isVoiceProviderExcludedFromRules(preferredVoice.voiceProvider, activeProviderRules, {
        projectExperience: 'character',
        mode: inputMode,
        languageCode: selectedLanguage,
      });
    if (!shouldClear) return;
    setLanguageVoices((prev) => {
      if (prev[selectedLanguage] !== selectedVoiceIdFromPrefs) return prev;
      const next = { ...prev };
      delete next[selectedLanguage];
      return next;
    });
  }, [activeProviderRules, getByExternalId, inputMode, selectedLanguage, selectedVoiceIdFromPrefs]);

  const onSingleLanguageChange = (codes: TargetLanguageCode[]) => {
    const normalized = normalizeLanguageList(codes, selectedLanguage);
    const next = normalized.length > 1
      ? normalized[normalized.length - 1]!
      : normalized[0]!;
    setSelectedLanguage(next);
    if (status === 'authenticated') {
      void update('targetLanguages' as any, [next] as any).catch((error) => {
        console.error('Failed to save language preference', error);
        toast.error(copy.toastLanguageSaveFailed);
      });
    }
  };

  const onVoiceButtonClick = (language: TargetLanguageCode) => {
    setVoicePickerLanguage(language);
    setVoicePickerOpen(true);
  };

  const onVoiceDialogOpenChange = (next: boolean) => {
    if (!next) {
      setVoicePickerOpen(false);
      setVoicePickerLanguage(null);
    }
  };

  const onVoiceDialogSelect = async (voiceId: string | null) => {
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

    if (status === 'authenticated') {
      try {
        await update('languageVoicePreferences' as any, normalizeLanguageVoiceMap(nextMap) as any);
      } catch (error) {
        console.error('Failed to save voice preference', error);
        setLanguageVoices(previous);
        toast.error(copy.toastVoiceSaveFailed);
        return;
      }
    }

    setVoicePickerOpen(false);
    setVoicePickerLanguage(null);
  };

  const onModeToggle = async () => {
    const previous = useExact;
    const next = !previous;
    setUseExact(next);
    if (status !== 'authenticated') return;

    try {
      await update('defaultUseScript' as any, next as any);
    } catch (error) {
      console.error('Failed to save mode preference', error);
      setUseExact(previous);
      toast.error(copy.toastModeSaveFailed);
    }
  };

  const onToneSelect = async (tone: ContentTone) => {
    if (contentTone === tone) return;
    const previous = contentTone;
    setContentTone(tone);
    if (status !== 'authenticated') return;

    try {
      await update('characterContentTone' as any, tone as any);
    } catch (error) {
      console.error('Failed to save tone preference', error);
      setContentTone(previous);
      toast.error(copy.toastToneSaveFailed);
    }
  };

  useEffect(() => {
    if (!shouldAnimatePlaceholder) return;

    const currentPrompt = interactivePrompts[animatedPromptIndex] ?? interactivePrompts[0];
    const isFullyTyped = animatedPlaceholder.length >= currentPrompt.length;
    const isFullyDeleted = animatedPlaceholder.length === 0;

    let timeoutMs = 0;
    if (isDeletingPlaceholder) {
      timeoutMs = isFullyDeleted ? 120 : 12;
    } else {
      timeoutMs = isFullyTyped ? 500 : 32;
    }

    const timer = setTimeout(() => {
      if (isDeletingPlaceholder) {
        if (isFullyDeleted) {
          setIsDeletingPlaceholder(false);
          setAnimatedPromptIndex((prev) => (prev + 1) % interactivePrompts.length);
          return;
        }
        setAnimatedPlaceholder((prev) => prev.slice(0, -1));
        return;
      }

      if (isFullyTyped) {
        setIsDeletingPlaceholder(true);
        return;
      }
      setAnimatedPlaceholder(currentPrompt.slice(0, animatedPlaceholder.length + 1));
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [animatedPlaceholder, animatedPromptIndex, interactivePrompts, isDeletingPlaceholder, shouldAnimatePlaceholder]);

  useEffect(() => {
    if (shouldAnimatePlaceholder) return;
    setAnimatedPlaceholder('');
    setIsDeletingPlaceholder(false);
  }, [shouldAnimatePlaceholder]);

  const buildAttemptPayload = (result: 'paywall_shown' | 'confirm_shown', clientAttemptId = createProjectAttemptClientId()) => {
    const characterSettings = normalizeCharacterCreationSettings(settings?.characterCreationSettings ?? null);
    const selectedLanguageVoices = selectedVoiceId ? { [selectedLanguage]: selectedVoiceId } : {};
    return {
      ...collectProjectAttemptContext({
        sourceToolSlug,
        mainPageMode: 'brainrot',
        mainPageCategoryId: backCategoryId,
        characterSlug: character.slug ?? character.id,
      }),
      clientAttemptId,
      result,
      promptText: scriptText.trim(),
      promptMode: useExact ? 'script' as const : 'idea' as const,
      projectExperience: 'character' as const,
      durationSeconds: CHARACTER_PROJECT_TARGET_DURATION_SECONDS,
      tokenCost,
      tokenBalance: balance,
      mainPageMode: 'brainrot',
      mainPageCategoryId: backCategoryId,
      characterSlug: character.slug ?? character.id,
      languageCodes: [selectedLanguage],
      languageVoices: selectedLanguageVoices,
      settingsSnapshot: {
        contentTone,
        useExactTextAsScript: useExact,
        characterCreationSettings: characterSettings,
        includeDefaultMusic: false,
        addOverlay: characterSettings.addOverlay,
        watermarkEnabled: characterSettings.watermarkEnabled,
        captionsEnabled: characterSettings.captionsEnabled,
        includeCallToAction: characterSettings.includeCallToAction,
      },
    };
  };

  const onCreate = async () => {
    if (!canAttemptCreation) return;

    if (status !== 'authenticated') {
      setAuthOpen(true);
      return;
    }
    if (!hasEnoughTokens) {
      setSelectedPlanKey('monthly');
      if (!shutdownDate) await recordProjectCreationAttemptFromClient(buildAttemptPayload('paywall_shown'));
      setPaywallOpen(true);
      return;
    }
    setConfirmOpen(true);
  };

  async function onConfirmCreate() {
    if (!canAttemptCreation || submitting) return;
    setSubmitting(true);
    try {
      const recordedAttempt = await recordProjectCreationAttemptFromClient(buildAttemptPayload('confirm_shown'));
      const characterSettings = normalizeCharacterCreationSettings(settings?.characterCreationSettings ?? null);
      const trimmedScriptText = scriptText.trim();
      const payload: Record<string, unknown> = {
        durationSeconds: CHARACTER_PROJECT_TARGET_DURATION_SECONDS,
        characterSlug: character.slug ?? character.id,
        projectExperience: 'character' as const,
        contentTone,
        languages: [selectedLanguage],
        languageVoices: selectedVoiceId ? { [selectedLanguage]: selectedVoiceId } : undefined,
        includeDefaultMusic: false,
        addOverlay: characterSettings.addOverlay,
        watermarkEnabled: characterSettings.watermarkEnabled,
        captionsEnabled: characterSettings.captionsEnabled,
        includeCallToAction: characterSettings.includeCallToAction,
      };
      if (recordedAttempt?.id) {
        payload.creationAttemptId = recordedAttempt.id;
      }
      if (useExact) {
        payload.useExactTextAsScript = true;
        payload.rawScript = trimmedScriptText;
      } else {
        payload.prompt = trimmedScriptText;
      }
      const response = await Api.createProject(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project:created', { detail: response }));
      }
      setConfirmOpen(false);
      router.push(`/project/${response.id}`);
    } catch (error) {
      console.error('Failed to create character project', error);
      toast.error(copy.toastCreateProjectFailed);
      setSubmitting(false);
    }
  }

  async function onDownloadCharacter() {
    try {
      const response = await fetch(character.previewImageUrl);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = downloadFileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to download character image', error);
      toast.error(copy.toastDownloadCharacterFailed);
    }
  }

  async function openSubscriptionCheckout(plan: SubscriptionPlanKey) {
    if (checkoutPlan) return;
    setCheckoutPlan(plan);
    try {
      const result = await Api.createSubscriptionCheckout(plan);
      if (result.action === 'checkout') {
        window.location.href = result.url;
      } else if (result.action === 'already_on_plan') {
        toast.info(copy.toastPlanAlreadyActive);
      } else {
        toast.success(copy.toastSubscriptionUpdated);
      }
    } catch (error) {
      console.error('Failed to open subscription checkout', error);
      toast.error(copy.toastOpenCheckoutFailed);
    } finally {
      setCheckoutPlan(null);
    }
  }

  return (
    <div className={`mx-auto w-full max-w-6xl px-3 ${showGuestStickyDownloadSection ? 'pb-40' : 'pb-12'} sm:px-0`}>
      <div className="mb-5">
        <div className="mb-3 flex items-center gap-3">
          <Link
            href={categoriesHref}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3 text-blue-700 shadow-sm backdrop-blur-sm transition hover:border-blue-300 hover:text-blue-800 dark:border-blue-800/80 dark:bg-gray-950/70 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:text-blue-200"
            aria-label={copy.backToCategoryAria(backLabel)}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">{backLabel}</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-0 ${
              favoriteState.isFavorited
                ? 'bg-amber-100 text-amber-800 shadow-[0_2px_8px_rgba(217,119,6,0.25)] hover:bg-amber-200'
                : 'bg-white text-slate-600 shadow-[0_1px_6px_rgba(15,23,42,0.12)] hover:bg-amber-50 hover:text-amber-800'
            } ${favoritePulse ? 'scale-110 shadow-[0_6px_16px_rgba(245,158,11,0.35)]' : 'scale-100'}`}
            aria-label={favoriteState.isFavorited ? copy.removeFavoriteAria : copy.addFavoriteAria}
          >
            {favoritePulse ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-amber-300/80 animate-ping"
              />
            ) : null}
            <Star
              className={`h-5 w-5 transition-all duration-300 ease-out ${
                favoriteState.isFavorited
                  ? 'fill-amber-300 text-amber-500'
                  : 'fill-transparent text-slate-600'
              } ${favoritePulse ? 'scale-125 -rotate-6' : 'scale-100 rotate-0'}`}
            />
          </button>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl">{character.name}</h1>
        </div>
        <hr className="mt-4 border-gray-200 dark:border-gray-800" />
      </div>

      <div className="space-y-6">
        <section className="rounded-xl bg-white py-4 sm:py-5 dark:bg-gray-900">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start">
            <div>
              <CharacterPreviewCard
                item={character}
                showName={false}
                showFooterOverlay={false}
                showPlaybackButton
                className="w-full max-w-[216px] rounded-xl mx-auto lg:mx-0"
              />
            </div>

            <div className="lg:max-w-[860px]">
              <div className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">{copy.scriptPromptTitle}</div>
              <Textarea
                value={scriptText}
                onChange={(event) => setScriptText(event.target.value)}
                onFocus={() => setIsPromptFocused(true)}
                onBlur={() => setIsPromptFocused(false)}
                placeholder={shouldAnimatePlaceholder ? (animatedPlaceholder || ' ') : copy.defaultPromptPlaceholder}
                className="min-h-[280px] w-full resize-y"
                suppressHydrationWarning
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Popover>
                    <Tooltip content={copy.settingsLabel}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="relative inline-grid cursor-pointer place-items-center rounded-full p-0 leading-none"
                          aria-label={copy.settingsLabel}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                    </Tooltip>
                    <PopoverContent side="bottom" align="start" className="w-[min(320px,calc(100vw-1rem))] sm:w-[320px]">
                      <CharacterCreationSettingsPopover />
                    </PopoverContent>
                  </Popover>
                  <LanguageDropdown
                    values={[selectedLanguage]}
                    onChange={onSingleLanguageChange}
                    languageVoices={languageVoices}
                    onVoiceClick={onVoiceButtonClick}
                    resolveVoiceOption={getByExternalId}
                    autoVoices={autoVoices}
                    voiceModalOpen={voicePickerOpen}
                    selectionStyle="character"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer rounded-full"
                    onClick={() => onVoiceButtonClick(selectedLanguage)}
                  >
                    <Mic className="mr-2 h-4 w-4" />
                    {selectedVoiceLabel}
                  </Button>
                  <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
                    {CONTENT_TONE_OPTIONS.map((option) => {
                      const active = contentTone === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            void onToneSelect(option.value);
                          }}
                          className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-full text-sm font-medium leading-none transition-[background-color,color,box-shadow,transform,padding] duration-200 ease-out ${
                            active
                              ? 'bg-blue-600 px-3.5 text-white shadow-[0_4px_12px_rgba(37,99,235,0.35)]'
                              : 'px-2.5 text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                          }`}
                          aria-label={copy.toneLabels[option.value]}
                          aria-pressed={active}
                        >
                          <span
                            className={`inline-flex items-center leading-none transition-transform duration-200 ${active ? 'scale-100' : 'scale-95'}`}
                            aria-hidden="true"
                          >
                            {option.emoji}
                          </span>
                          <span
                            className={`inline-flex items-center overflow-hidden whitespace-nowrap leading-none transition-[max-width,opacity] duration-200 ease-out ${
                              active ? 'max-w-32 opacity-100' : 'max-w-0 opacity-0'
                            }`}
                          >
                            {copy.toneLabels[option.value]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Tooltip content={useExact ? copy.modeScriptTooltip : copy.modeIdeaTooltip}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={
                        'cursor-pointer rounded-full ' +
                        (useExact
                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : '')
                      }
                      aria-label={useExact ? copy.modeScript : copy.modeIdea}
                      aria-pressed={useExact}
                      onClick={() => {
                        void onModeToggle();
                      }}
                    >
                      {useExact ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <Lightbulb className="h-4 w-4" />
                      )}
                    </Button>
                  </Tooltip>
                </div>
                <Button
                  className="brainrot-cta-gradient cursor-pointer rounded-2xl border-0 px-5 py-2.5 text-sm font-semibold text-black shadow-lg outline-none transition hover:text-black hover:shadow-xl focus-visible:outline-none"
                  onClick={onCreate}
                  disabled={!canAttemptCreation || startingProvider !== null || status === 'loading'}
                >
                  <Clapperboard className="mr-2 h-4 w-4" />
                  {copy.createVideo}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {showAuthorizedInlineDownloadSection ? (
          <section className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/70 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {copy.downloadInlineTitle(character.name)}
                </div>
                <p>
                  {copy.downloadInlineDescription}
                </p>
              </div>
              <Button
                type="button"
                onClick={onDownloadCharacter}
                variant="outline"
                className="cursor-pointer border border-gray-300/90 bg-white text-gray-700 shadow-sm transition-colors duration-200 hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200 dark:hover:bg-gray-900 dark:hover:text-white"
                aria-label={copy.downloadCharacterAria(character.name)}
              >
                <Download className="mr-2 h-4 w-4" />
                {copy.downloadButton}
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{copy.authRequiredTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <SignupNotice>{copy.authRequiredDescription}</SignupNotice>
          </p>
          <div className="mt-4 space-y-2">
            <AuthActionButton
              label={copy.continueWithGoogle}
              icon={<Image src="/google.svg" alt="" width={18} height={18} className="mr-2" />}
              loadingLabel={copy.signingIn}
              loading={startingProvider === 'google'}
              disabled={startingProvider !== null}
              onClick={() => {
                if (startingProvider) return;
                setStartingProvider('google');
                void signIn('google');
              }}
            />
            <AuthActionButton
              label={copy.continueWithApple}
              icon={<Image src="/apple.svg" alt="" width={18} height={18} className="mr-2" />}
              loadingLabel={copy.signingIn}
              loading={startingProvider === 'apple'}
              disabled={startingProvider !== null}
              onClick={() => {
                if (startingProvider) return;
                setStartingProvider('apple');
                void signIn('apple');
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <VoicePickerDialog
        open={voicePickerOpen && !!voicePickerLanguage}
        languageCode={voicePickerLanguage}
        onOpenChange={onVoiceDialogOpenChange}
        availabilityContext={{
          projectExperience: 'character',
          mode: inputMode,
        }}
        selectedVoiceId={
          (() => {
            if (!voicePickerLanguage) return null;
            const storedVoiceId = languageVoices[voicePickerLanguage];
            if (!storedVoiceId) return null;
            const voice = getByExternalId(storedVoiceId);
            if (!voice) return null;
            if (isVoiceProviderExcludedFromRules(voice.voiceProvider, activeProviderRules, {
              projectExperience: 'character',
              mode: inputMode,
              languageCode: voicePickerLanguage,
            })) {
              return null;
            }
            return voice.externalId ?? null;
          })()
        }
        onSelect={onVoiceDialogSelect}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{copy.confirmProjectCreationTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {copy.confirmWithdrawIntro}{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">{tokenCost}</span>{' '}
            {copy.confirmWithdrawOutro}{' '}
            {copy.confirmBalanceLabel}{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">{projectedBalance}</span>{' '}
            {copy.confirmBalanceOutro}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              className="cursor-pointer border border-emerald-700/30 bg-[linear-gradient(110deg,#1f9a52_0%,#2db765_45%,#188a48_100%)] bg-[length:220%_100%] bg-[position:0%_50%] text-white shadow-[0_8px_18px_rgba(20,129,70,0.34)] transition-[background-position,filter,box-shadow] duration-500 hover:bg-[position:100%_50%] hover:brightness-110 hover:shadow-[0_10px_22px_rgba(20,129,70,0.44)]"
              onClick={onConfirmCreate}
              disabled={submitting || !hasEnoughTokens}
            >
              {copy.confirmAndCreate}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} cost={tokenCost} balance={balance}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[1040px]">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {copy.topUpTitle}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {copy.topUpDescription}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {copy.paywallCurrentBalance(balance)}
          </p>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subscriptionPlans.map((plan) => {
              const isSelected = selectedPlan?.planKey === plan.planKey;
              const perLabel = copy.paywallPerPeriod(plan.interval);
              return (
                <button
                  type="button"
                  key={plan.planKey}
                  onClick={() => setSelectedPlanKey(plan.planKey)}
                  disabled={checkoutPlan !== null}
                  className={[
                    'relative mt-3 min-w-0 cursor-pointer rounded-2xl border p-5 pt-6 text-left transition-[border-color,box-shadow,background-color,transform] duration-200 ease-out will-change-transform',
                    isSelected
                      ? 'border-blue-400 bg-blue-50/60 shadow-[0_12px_28px_rgba(37,99,235,0.18)] dark:border-blue-700 dark:bg-blue-950/25'
                      : 'border-gray-200 bg-white hover:scale-[1.01] hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-blue-800',
                  ].join(' ')}
                >
                  <div className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 rounded-full border border-amber-300/80 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/40 dark:text-amber-200">
                    {copy.paywallChipLabel(plan.planKey)}
                  </div>
                  <div className="flex items-end justify-center gap-1 whitespace-nowrap">
                    <span className="text-4xl font-bold leading-none text-gray-900 dark:text-gray-100">${plan.priceUsd.toFixed(2)}</span>
                    <span className="pb-0.5 text-lg text-gray-500 dark:text-gray-400">/{perLabel}</span>
                  </div>
                  <div className="mt-4 space-y-1.5 text-base text-gray-700 dark:text-gray-300">
                    {plan.ui.benefits.map((benefit, benefitIndex) => {
                      if (benefit.key === 'tokens_per_charge' && typeof benefit.tokens === 'number') {
                        return <p key={`${plan.planKey}-benefit-${benefitIndex}`}>{benefit.tokens.toLocaleString()} {copy.tokensPerCharge}</p>;
                      }
                      if (benefit.key === 'images_per_period' && typeof benefit.images === 'number' && benefit.interval) {
                        return <p key={`${plan.planKey}-benefit-${benefitIndex}`}>{copy.imagesPerPeriod(benefit.images.toLocaleString(), benefit.interval)}</p>;
                      }
                      if (benefit.key === 'videos_per_period' && typeof benefit.videos === 'number' && benefit.interval) {
                        return <p key={`${plan.planKey}-benefit-${benefitIndex}`}>{copy.videosPerPeriod(formatSubscriptionVideoCountForPaywall(benefit.videos), benefit.interval)}</p>;
                      }
                      return null;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            className="brainrot-cta-gradient mx-auto mt-5 flex h-14 w-full max-w-[352px] cursor-pointer items-center justify-center rounded-full border-0 px-6 text-base font-semibold text-black shadow-lg outline-none transition hover:text-black hover:shadow-xl focus-visible:outline-none"
            onClick={() => {
              if (!selectedPlan) return;
              void openSubscriptionCheckout(selectedPlan.planKey);
            }}
            disabled={checkoutPlan !== null || !selectedPlan}
          >
            {checkoutPlan ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {copy.openingCheckout}
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {copy.paywallSubscribeWithPrice(selectedPlanAmount, selectedPerLabel)}
              </>
            )}
          </Button>
        </DialogContent>
      </PaywallDialog>

      {showGuestStickyDownloadSection ? (
        <section className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgba(0,0,0,0.08)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:py-5">
            <div className="order-2 text-sm text-gray-700 dark:text-gray-200 sm:order-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {copy.guestDownloadTitle(character.name)}
              </div>
              <p>
                {copy.guestDownloadDescription}
              </p>
            </div>
            <Button
              type="button"
              onClick={onDownloadCharacter}
              className="order-1 cursor-pointer border border-emerald-700/30 bg-[linear-gradient(110deg,#1f9a52_0%,#2db765_45%,#188a48_100%)] bg-[length:220%_100%] text-white shadow-[0_8px_18px_rgba(20,129,70,0.34)] transition-[filter,box-shadow] duration-500 motion-safe:animate-[horizontal-gradient-flow_2.4s_ease-in-out_infinite] hover:brightness-110 hover:shadow-[0_10px_22px_rgba(20,129,70,0.44)] sm:order-2"
              aria-label={copy.downloadCharacterAria(character.name)}
            >
              <Download className="mr-2 h-4 w-4" />
              {copy.downloadButton}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AuthActionButton({
  label,
  icon,
  loadingLabel,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  loadingLabel: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button className="w-full cursor-pointer justify-center" onClick={onClick} disabled={disabled}>
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </Button>
  );
}
