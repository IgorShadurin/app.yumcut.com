"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DurationDropdown } from './DurationDropdown';
import { LanguageDropdown } from './LanguageDropdown';
import { SettingsPopover } from './SettingsPopover';
import { CharacterModal, type CharacterSelection } from './CharacterModal';
import { VoicePickerDialog } from './VoicePickerDialog';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/common/Tooltip';
import { Wand2, Loader2, Settings, Smartphone, User, Lightbulb, FileText, Layers } from 'lucide-react';
import { LIMITS } from '@/shared/constants/limits';
import { useTokenSummary } from '@/hooks/useTokenSummary';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { pickRandomPlaceholder } from '@/shared/constants/prompt-placeholders';
import { DEFAULT_LANGUAGE, TargetLanguageCode, normalizeLanguageList, resolvePrimaryLanguage } from '@/shared/constants/languages';
import { useSettings } from '@/hooks/useSettings';
import { storeProjectDraft } from '@/lib/project-draft';
import { toast } from 'sonner';
import type { CharacterSelectionSnapshot, PendingProjectDraft, LanguageVoiceMap } from '@/shared/types';
import { useVoices } from '@/hooks/useVoices';
import { TemplatePicker, type TemplateSelection } from '@/components/templates/TemplatePicker';
import { normalizeLanguageVoiceMap, extractExplicitLanguageVoices } from '@/shared/voices/language-voice-map';
import { validateProjectState } from '@/shared/projects';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';
import { TokenLowBalanceAlert } from './TokenLowBalanceAlert';

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
  subtitle: string;
  placeholder: string;
  verticalFormat: string;
  settings: string;
  chooseCharacter: string;
  character: string;
  modeScriptTooltip: string;
  modeIdeaTooltip: string;
  modeScript: string;
  modeIdea: string;
  createProject: string;
  create: string;
  notEnoughTokensTitle: string;
  notEnoughTokensDescription: (projectCost: number, tokenBalance: number) => string;
  buyTokens: string;
  tokenWarning: (projectCost: number, tokenBalance: number, duration: number, useExact: boolean) => string;
};

const PROMPT_INPUT_COPY: Record<AppLanguageCode, PromptInputCopy> = {
  en: {
    heading: 'What video to make?',
    subtitle: "Describe your concept or paste your text script. We'll create the whole video.",
    placeholder: 'Describe your idea…',
    verticalFormat: 'Vertical 9:16 format',
    settings: 'Settings',
    chooseCharacter: 'Choose character',
    character: 'Character',
    modeScriptTooltip: 'Script mode: exact text will be used as-is',
    modeIdeaTooltip: 'Idea mode: your idea will be expanded into a script',
    modeScript: 'Script',
    modeIdea: 'Idea',
    createProject: 'Create project',
    create: 'Create',
    notEnoughTokensTitle: 'Not enough tokens',
    notEnoughTokensDescription: (projectCost, tokenBalance) =>
      `You need ${projectCost} tokens for this project but have ${tokenBalance}.`,
    buyTokens: 'Buy tokens in the app',
    tokenWarning: (projectCost, tokenBalance, duration, useExact) =>
      `— You need ${projectCost} tokens for a${useExact ? ' default ' : ' '}${duration}-second project, but only have ${tokenBalance}. Add more tokens or shorten the duration.`,
  },
  ru: {
    heading: 'Какое видео создать?',
    subtitle: 'Опишите идею или вставьте готовый текст сценария. ЯмКат соберет ролик целиком.',
    placeholder: 'Опишите вашу идею…',
    verticalFormat: 'Вертикальный формат 9:16',
    settings: 'Настройки',
    chooseCharacter: 'Выбрать персонажа',
    character: 'Персонаж',
    modeScriptTooltip: 'Режим сценария: используем ваш текст без изменений',
    modeIdeaTooltip: 'Режим идеи: ИИ расширит идею до готового сценария',
    modeScript: 'Сценарий',
    modeIdea: 'Идея',
    createProject: 'Создать проект',
    create: 'Создать',
    notEnoughTokensTitle: 'Недостаточно токенов',
    notEnoughTokensDescription: (projectCost, tokenBalance) =>
      `Для этого проекта нужно ${projectCost} токенов, а у вас ${tokenBalance}.`,
    buyTokens: 'Купить токены',
    tokenWarning: (projectCost, tokenBalance, duration, useExact) =>
      `— Нужно ${projectCost} токенов для${useExact ? ' базового ' : ' '}${duration}-секундного проекта, но у вас только ${tokenBalance}. Пополните баланс или сократите длительность.`,
  },
};

export function PromptInput() {
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
  const { summary: tokenSummary, balance: tokenBalance, loading: tokensLoading } = useTokenSummary();
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
    if (!settings) return;
    const nextMap = normalizeLanguageVoiceMap((settings as any)?.languageVoicePreferences ?? null);
    setLanguageVoices((prev) => {
      const prevSerialized = JSON.stringify(prev);
      const nextSerialized = JSON.stringify(nextMap);
      return prevSerialized === nextSerialized ? prev : nextMap;
    });
  }, [settings?.languageVoicePreferences]);

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
  const languageMultiplier = Math.max(languages.length, 1);
  const minimumSeconds = tokenSummary?.minimumProjectSeconds ?? TOKEN_COSTS.minimumProjectSeconds;
  const effectiveDuration = useExact ? minimumSeconds : duration;
  const baseSeconds = Math.max(effectiveDuration, minimumSeconds);
  const perSecondCost = tokenSummary?.perSecondProject ?? TOKEN_COSTS.perSecondProject;
  const projectCost = baseSeconds * perSecondCost * languageMultiplier;
  const hasTokensForCurrent = tokenBalance >= projectCost;
  const showLowBalanceWarning = tokenBalance <= projectCost;

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
  }, [effectiveLanguageVoiceProviders, languages, templateCustomData, text, useExact]);

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
    if (projectStateValidation.disabled.submit) return;
    if (!hasTokensForCurrent) {
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
    const trimmed = text.trim();
    const sanitizedLanguageVoices = normalizeLanguageVoiceMap(languageVoices);
    const apiLanguageVoices = extractExplicitLanguageVoices(sanitizedLanguageVoices);
    const payload: PendingProjectDraft['payload'] = { useExactTextAsScript: useExact };
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

    const draft: PendingProjectDraft = {
      id: draftId,
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
          <h1 className="text-pretty text-center font-semibold tracking-tighter text-gray-900 dark:text-gray-100 sm:text-[32px] md:text-[46px] text-[29px]">{copy.heading}</h1>
          <p className="mt-1 mb-6 text-center text-[clamp(12px,3.5vw,20px)] sm:text-[20px] text-gray-600 dark:text-gray-300 whitespace-normal text-pretty leading-tight tracking-tight">{copy.subtitle}</p>
        </div>
        {/* Unified input container: textarea on top, control bar at bottom; same visual block */}
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-800">
          <Textarea
            className="min-h-[140px] sm:min-h-[180px] w-full resize-none border-0 bg-transparent p-4 pr-4 text-sm leading-relaxed focus-visible:ring-0 focus-visible:outline-none"
            placeholder={placeholder || copy.placeholder}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next.length > LIMITS.promptMax ? next.slice(0, LIMITS.promptMax) : next);
            }}
            onKeyDown={(e) => {
              if (!submitting && !projectStateValidation.disabled.submit && (e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim()) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {projectStateValidation.fieldErrors.text ? (
            <div className="mt-2 px-4 pb-1 text-sm text-rose-700 dark:text-rose-200">
              {projectStateValidation.fieldErrors.text}
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-2 sm:px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Vertical format indicator (9:16), left-most */}
              <Tooltip content={copy.verticalFormat}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full border-blue-200 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40"
                  aria-label={copy.verticalFormat}
                  aria-pressed="true"
                  aria-disabled="true"
                  onClick={(e) => e.preventDefault()}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </Tooltip>
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
              <Popover>
                <Tooltip content={copy.settings}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="relative rounded-full p-0 inline-grid place-items-center leading-none"
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
              <Tooltip content={copy.chooseCharacter}>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative rounded-full"
                  onClick={() => setCharOpen(true)}
                  disabled={projectStateValidation.disabled.characters}
                >
                  <User className="mr-2 h-4 w-4" />
                  {copy.character}
                  {showCharacterIndicator ? (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-950" />
                  ) : null}
                </Button>
              </Tooltip>
              <Tooltip content={useExact ? copy.modeScriptTooltip : copy.modeIdeaTooltip}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    'rounded-full pl-2 pr-3 ' +
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
            </div>
            <Button
              type="button"
              className="w-full sm:w-9 sm:h-9 sm:px-0 sm:rounded-full"
              onClick={submit}
              disabled={!text.trim() || submitting || projectStateValidation.disabled.submit || (!tokensLoading && !hasTokensForCurrent)}
              aria-label={copy.createProject}
              title={copy.createProject}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              <span className="ml-2 sm:hidden">{copy.create}</span>
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {/* Character and exact script controls moved into the textarea control bar above */}
        </div>
        {(!tokensLoading && tokenSummary && showLowBalanceWarning) && (
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
      {/* Templates picker under textarea & settings */}
      <TemplatePicker onChange={handleTemplateChange} />

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
