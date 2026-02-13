import {
  Coins,
  Lightbulb,
  FileText,
  Timer,
  Globe2,
  Sparkles,
  UserRound,
  Mic,
  MicOff,
  Music,
  Layers,
  Droplet,
  Subtitles,
  Play,
  ShieldCheck,
  ClipboardList,
  AudioLines,
  Ban,
} from 'lucide-react';
import type { PendingProjectDraft } from '@/shared/types';
import { getLanguageFlag, getLanguageLabel, normalizeLanguageList, DEFAULT_LANGUAGE, type TargetLanguageCode } from '@/shared/constants/languages';
import type { SummaryItem, GuidanceSection } from './types';
import { features } from '@/lib/feature-flags';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type LanguageInfo = {
  codes: string[];
  badge: string;
  tooltip: string;
  flag: string;
  isMulti: boolean;
};

type CharacterInfo = {
  summary: string;
  isDynamic: boolean;
  imageUrl?: string | null;
  badge: string;
};

type VoiceInfo = {
  assignments: Array<{ languageCode: TargetLanguageCode; languageLabel: string; voiceLabel: string; isAuto: boolean }>;
  autoApprove: boolean;
};

type Options = {
  draft: PendingProjectDraft;
  voiceOption: { title?: string | null; description?: string | null } | null | undefined;
  defaultVoiceName: string;
  languageVoiceSelections?: Record<string, { voiceId: string | null; label: string }>;
  appLanguage: AppLanguageCode;
};

export type ProjectOverview = {
  language: LanguageInfo;
  character: CharacterInfo;
  voice: VoiceInfo;
  durationSummary: string;
  tokenCostBadge: string;
  summaryItems: SummaryItem[];
  guidanceSections: GuidanceSection[];
  scriptLabel: string;
  scriptCharCount: number;
  scriptText: string;
};

type OverviewCopy = {
  locale: string;
  tokensUnit: string;
  scriptTextLabel: string;
  ideaPromptLabel: string;
  multiLanguageBadge: string;
  targetLanguagesPrefix: string;
  targetLanguagePrefix: string;
  autoCharacterSummary: string;
  autoCharacterBadge: string;
  globalLibrary: string;
  myLibrary: string;
  variationFallback: string;
  characterFallback: string;
  autoVoiceLabel: string;
  durationSummaryFromScript: (effectiveSeconds: number) => string;
  durationSummaryFromIdea: (requestedSeconds: number, effectiveSeconds: number) => string;
  expectedRuntimeBadge: (requestedSeconds: number) => string;
  runtimeBasedOnScriptBadge: string;
  ideaModeTooltip: string;
  exactScriptTooltip: string;
  ideaModeBadge: string;
  exactScriptBadge: string;
  estimatedDurationTooltip: (requestedSeconds: number) => string;
  estimatedDurationFromScriptTooltip: string;
  multiLanguageVoicesBadge: string;
  voiceAutoBadge: string;
  voiceSelectionTooltip: string;
  autoSuffix: string;
  costTooltip: (tokenCostBadge: string, balanceLabel: string, hasEnoughTokens: boolean) => string;
  musicTooltip: (enabled: boolean) => string;
  musicOnBadge: string;
  musicOffBadge: string;
  overlayOnTooltip: string;
  overlayOffTooltip: string;
  overlayOnBadge: string;
  overlayOffBadge: string;
  watermarkOnTooltip: string;
  watermarkOffTooltip: string;
  watermarkOnBadge: string;
  watermarkOffBadge: string;
  captionsOnTooltip: string;
  captionsOffTooltip: string;
  captionsOnBadge: string;
  captionsOffBadge: string;
  ctaOnTooltip: string;
  ctaOffTooltip: string;
  ctaOnBadge: string;
  ctaOffBadge: string;
  scriptAutoOnTooltip: string;
  scriptAutoOffTooltip: string;
  scriptAutoOnBadge: string;
  scriptAutoOffBadge: string;
  audioAutoOnTooltip: string;
  audioAutoOffTooltip: string;
  audioAutoOnBadge: string;
  audioAutoOffBadge: string;
  guidanceCreationLabel: string;
  guidanceAvoidanceLabel: string;
  guidanceAudioLabel: string;
  guidanceCreationTag: string;
  guidanceAvoidanceTag: string;
  guidanceAudioTag: string;
};

const LANGUAGE_LABELS_BY_UI: Record<AppLanguageCode, Record<TargetLanguageCode, string>> = {
  en: {
    en: 'English',
    ru: 'Russian',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    it: 'Italian',
  },
  ru: {
    en: 'Английский',
    ru: 'Русский',
    es: 'Испанский',
    fr: 'Французский',
    de: 'Немецкий',
    pt: 'Португальский',
    it: 'Итальянский',
  },
};

const COPY: Record<AppLanguageCode, OverviewCopy> = {
  en: {
    locale: 'en-US',
    tokensUnit: 'tokens',
    scriptTextLabel: 'Script text',
    ideaPromptLabel: 'Idea prompt',
    multiLanguageBadge: 'Multi-language',
    targetLanguagesPrefix: 'Target languages',
    targetLanguagePrefix: 'Target language',
    autoCharacterSummary: 'Auto character: will be auto-generated from your story',
    autoCharacterBadge: 'Auto character',
    globalLibrary: 'Global library',
    myLibrary: 'My library',
    variationFallback: 'Variation',
    characterFallback: 'Character',
    autoVoiceLabel: 'Auto voice',
    durationSummaryFromScript: (effectiveSeconds) => `Script decides • minimum cost ${effectiveSeconds}s`,
    durationSummaryFromIdea: (requestedSeconds, effectiveSeconds) => `${requestedSeconds}s • minimum cost ${effectiveSeconds}s`,
    expectedRuntimeBadge: (requestedSeconds) => `${requestedSeconds}s expected runtime`,
    runtimeBasedOnScriptBadge: 'Runtime based on your script',
    ideaModeTooltip: 'Idea mode: we expand your prompt into a full script before rendering the video.',
    exactScriptTooltip: 'Exact script: we use your provided text verbatim for the video.',
    ideaModeBadge: 'Idea mode',
    exactScriptBadge: 'Exact script',
    estimatedDurationTooltip: (requestedSeconds) => `Estimated video length: about ${requestedSeconds} seconds`,
    estimatedDurationFromScriptTooltip: 'Estimated video length will follow your script timing',
    multiLanguageVoicesBadge: 'Multi-language voices',
    voiceAutoBadge: 'Voice: Auto',
    voiceSelectionTooltip: 'Voiceover voice selection.',
    autoSuffix: ' (auto)',
    costTooltip: (tokenCostBadge, balanceLabel, hasEnoughTokens) =>
      hasEnoughTokens
        ? `Project cost: ${tokenCostBadge} • Balance: ${balanceLabel} tokens`
        : `Project cost: ${tokenCostBadge} • Balance: ${balanceLabel} tokens (add more tokens before launch)`,
    musicTooltip: (enabled) => `Include default music: ${enabled ? 'Yes' : 'No'}`,
    musicOnBadge: 'Music on',
    musicOffBadge: 'Music off',
    overlayOnTooltip: 'Overlay: On. Adds animated visual layers to the final video.',
    overlayOffTooltip: 'Overlay: Off. Final video renders without extra visual layers.',
    overlayOnBadge: 'Overlay on',
    overlayOffBadge: 'Overlay off',
    watermarkOnTooltip: 'Watermark: On. Branding watermark will appear on the final video.',
    watermarkOffTooltip: 'Watermark: Off. Video renders without watermark.',
    watermarkOnBadge: 'Watermark on',
    watermarkOffBadge: 'Watermark off',
    captionsOnTooltip: 'Captions: On. Burn-in captions will be added to the video.',
    captionsOffTooltip: 'Captions: Off. Video renders without captions.',
    captionsOnBadge: 'Captions on',
    captionsOffBadge: 'Captions off',
    ctaOnTooltip: 'Include a Call to Action segment at the end if available',
    ctaOffTooltip: 'No CTA segment will be appended',
    ctaOnBadge: 'CTA on',
    ctaOffBadge: 'CTA off',
    scriptAutoOnTooltip: 'Auto-approve script: On',
    scriptAutoOffTooltip: 'Auto-approve script: Off (manual review)',
    scriptAutoOnBadge: 'Script auto',
    scriptAutoOffBadge: 'Script review',
    audioAutoOnTooltip: 'Auto-approve voiceover: On',
    audioAutoOffTooltip: 'Auto-approve voiceover: Off (manual review)',
    audioAutoOnBadge: 'Voice auto',
    audioAutoOffBadge: 'Voice review',
    guidanceCreationLabel: 'Script creation prompt',
    guidanceAvoidanceLabel: 'Script avoidance prompt',
    guidanceAudioLabel: 'Audio style prompt',
    guidanceCreationTag: 'LLM guidance',
    guidanceAvoidanceTag: 'Keep out',
    guidanceAudioTag: 'Voice vibe',
  },
  ru: {
    locale: 'ru-RU',
    tokensUnit: 'токенов',
    scriptTextLabel: 'Текст сценария',
    ideaPromptLabel: 'Идея',
    multiLanguageBadge: 'Несколько языков',
    targetLanguagesPrefix: 'Языки проекта',
    targetLanguagePrefix: 'Язык проекта',
    autoCharacterSummary: 'Автоперсонаж: будет сгенерирован по вашему сюжету',
    autoCharacterBadge: 'Автоперсонаж',
    globalLibrary: 'Общая библиотека',
    myLibrary: 'Моя библиотека',
    variationFallback: 'Вариация',
    characterFallback: 'Персонаж',
    autoVoiceLabel: 'Автоголос',
    durationSummaryFromScript: (effectiveSeconds) => `По сценарию • минимум ${effectiveSeconds}с`,
    durationSummaryFromIdea: (requestedSeconds, effectiveSeconds) => `${requestedSeconds}с • минимум ${effectiveSeconds}с`,
    expectedRuntimeBadge: (requestedSeconds) => `${requestedSeconds}с ожидаемая длительность`,
    runtimeBasedOnScriptBadge: 'Длительность по вашему сценарию',
    ideaModeTooltip: 'Режим идеи: мы развернем ваш запрос в полный сценарий перед рендером видео.',
    exactScriptTooltip: 'Точный текст: используем ваш текст без изменений.',
    ideaModeBadge: 'Режим идеи',
    exactScriptBadge: 'Точный текст',
    estimatedDurationTooltip: (requestedSeconds) => `Ожидаемая длительность: около ${requestedSeconds} секунд`,
    estimatedDurationFromScriptTooltip: 'Длительность будет рассчитана по таймингу вашего сценария',
    multiLanguageVoicesBadge: 'Голоса для нескольких языков',
    voiceAutoBadge: 'Голос: авто',
    voiceSelectionTooltip: 'Выбор голоса для озвучки.',
    autoSuffix: ' (авто)',
    costTooltip: (tokenCostBadge, balanceLabel, hasEnoughTokens) =>
      hasEnoughTokens
        ? `Стоимость проекта: ${tokenCostBadge} • Баланс: ${balanceLabel} токенов`
        : `Стоимость проекта: ${tokenCostBadge} • Баланс: ${balanceLabel} токенов (пополните баланс перед запуском)`,
    musicTooltip: (enabled) => `Музыка по умолчанию: ${enabled ? 'включена' : 'выключена'}`,
    musicOnBadge: 'Музыка вкл',
    musicOffBadge: 'Музыка выкл',
    overlayOnTooltip: 'Оверлей: включен. В видео будут добавлены анимированные визуальные слои.',
    overlayOffTooltip: 'Оверлей: выключен. Видео будет без дополнительных визуальных слоев.',
    overlayOnBadge: 'Оверлей вкл',
    overlayOffBadge: 'Оверлей выкл',
    watermarkOnTooltip: 'Водяной знак: включен. Брендовый знак будет добавлен в финальное видео.',
    watermarkOffTooltip: 'Водяной знак: выключен. Видео будет без водяного знака.',
    watermarkOnBadge: 'Водяной знак вкл',
    watermarkOffBadge: 'Водяной знак выкл',
    captionsOnTooltip: 'Субтитры: включены. В видео будут встроенные субтитры.',
    captionsOffTooltip: 'Субтитры: выключены. Видео будет без субтитров.',
    captionsOnBadge: 'Субтитры вкл',
    captionsOffBadge: 'Субтитры выкл',
    ctaOnTooltip: 'В конце ролика будет добавлен призыв к действию, если он доступен.',
    ctaOffTooltip: 'Призыв к действию не будет добавлен.',
    ctaOnBadge: 'Призыв вкл',
    ctaOffBadge: 'Призыв выкл',
    scriptAutoOnTooltip: 'Автоподтверждение сценария: включено',
    scriptAutoOffTooltip: 'Автоподтверждение сценария: выключено (ручная проверка)',
    scriptAutoOnBadge: 'Сценарий авто',
    scriptAutoOffBadge: 'Сценарий вручную',
    audioAutoOnTooltip: 'Автоподтверждение озвучки: включено',
    audioAutoOffTooltip: 'Автоподтверждение озвучки: выключено (ручная проверка)',
    audioAutoOnBadge: 'Озвучка авто',
    audioAutoOffBadge: 'Озвучка вручную',
    guidanceCreationLabel: 'Подсказка для сценария',
    guidanceAvoidanceLabel: 'Ограничения для сценария',
    guidanceAudioLabel: 'Подсказка для озвучки',
    guidanceCreationTag: 'ИИ-подсказка',
    guidanceAvoidanceTag: 'Избегать',
    guidanceAudioTag: 'Тон голоса',
  },
};

function getUiLanguageLabel(appLanguage: AppLanguageCode, code: TargetLanguageCode): string {
  return LANGUAGE_LABELS_BY_UI[appLanguage][code] ?? getLanguageLabel(code);
}

export function buildProjectOverview({
  draft,
  voiceOption,
  defaultVoiceName,
  languageVoiceSelections,
  appLanguage,
}: Options): ProjectOverview {
  const copy = COPY[appLanguage];
  const language = buildLanguageInfo(draft, appLanguage, copy);
  const character = buildCharacterInfo(draft, copy);
  const voice = buildVoiceInfo(draft, voiceOption, defaultVoiceName, languageVoiceSelections, appLanguage, copy);
  const durationSummary = buildDurationSummary(draft, copy);
  const tokenCostBadge = `${Math.round(draft.tokenCost).toLocaleString(copy.locale)} ${copy.tokensUnit}`;

  return {
    language,
    character,
    voice,
    durationSummary,
    tokenCostBadge,
    summaryItems: buildSummaryItems({ draft, language, character, voice, tokenCostBadge, copy }),
    guidanceSections: buildGuidanceSections(draft, copy),
    scriptLabel: draft.useExact ? copy.scriptTextLabel : copy.ideaPromptLabel,
    scriptCharCount: draft.text.length,
    scriptText: draft.text,
  };
}

function buildLanguageInfo(draft: PendingProjectDraft, appLanguage: AppLanguageCode, copy: OverviewCopy): LanguageInfo {
  const codes = normalizeLanguageList(draft.languageCodes ?? draft.languageCode ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const isMulti = codes.length > 1;
  const listLabel = codes.map((code) => getUiLanguageLabel(appLanguage, code as TargetLanguageCode)).join(' · ');
  const badge = isMulti ? copy.multiLanguageBadge : listLabel;
  const flag = isMulti ? '🌐' : getLanguageFlag(codes[0]);
  const tooltip = isMulti
    ? `${copy.targetLanguagesPrefix}:\n${codes
        .map((code) => `${getLanguageFlag(code)} ${getUiLanguageLabel(appLanguage, code as TargetLanguageCode)}`)
        .join('\n')}`
    : `${copy.targetLanguagePrefix}: ${getLanguageFlag(codes[0])} ${getUiLanguageLabel(appLanguage, codes[0] as TargetLanguageCode)}`;
  return { codes, badge, tooltip, flag, isMulti };
}

function buildCharacterInfo(draft: PendingProjectDraft, copy: OverviewCopy): CharacterInfo {
  const isDynamic = (draft.payload?.characterSelection as any)?.source === 'dynamic' || draft.character?.source === 'dynamic';
  if (isDynamic) {
    return {
      summary: copy.autoCharacterSummary,
      isDynamic: true,
      badge: copy.autoCharacterBadge,
    };
  }
  if (draft.character) {
    const libraryLabel = draft.character.source
      ? draft.character.source === 'global'
        ? copy.globalLibrary
        : copy.myLibrary
      : '';
    const summary = `${draft.character.variationTitle || copy.variationFallback} · ${draft.character.characterTitle || copy.characterFallback}${libraryLabel ? ` (${libraryLabel})` : ''}`;
    return {
      summary,
      isDynamic: false,
      imageUrl: draft.character.imageUrl ?? null,
      badge: draft.character.variationTitle || copy.characterFallback,
    };
  }
  return {
    summary: copy.autoCharacterBadge,
    isDynamic: false,
    badge: copy.autoCharacterBadge,
  };
}

function buildVoiceInfo(
  draft: PendingProjectDraft,
  voiceOption: { title?: string | null; description?: string | null } | null | undefined,
  defaultVoiceName: string,
  languageVoiceSelections: Record<string, { voiceId: string | null; label: string }> | undefined,
  appLanguage: AppLanguageCode,
  copy: OverviewCopy,
): VoiceInfo {
  const codes = normalizeLanguageList(draft.languageCodes ?? draft.languageCode ?? DEFAULT_LANGUAGE, DEFAULT_LANGUAGE);
  const assignments = codes.map((code) => {
    const entry = languageVoiceSelections?.[code];
    const fallbackVoiceId = entry?.voiceId ?? draft.languageVoices?.[code as keyof typeof draft.languageVoices] ?? draft.voiceId ?? null;
    const voiceLabel = entry?.label ?? (fallbackVoiceId ? voiceOption?.title ?? defaultVoiceName : copy.autoVoiceLabel);
    return {
      languageCode: code as TargetLanguageCode,
      languageLabel: getUiLanguageLabel(appLanguage, code as TargetLanguageCode),
      voiceLabel,
      isAuto: !entry?.voiceId && !fallbackVoiceId,
    };
  });
  if (!assignments.length) {
    assignments.push({
      languageCode: DEFAULT_LANGUAGE,
      languageLabel: getUiLanguageLabel(appLanguage, DEFAULT_LANGUAGE),
      voiceLabel: voiceOption?.title ?? defaultVoiceName,
      isAuto: !draft.voiceId,
    });
  }
  return {
    assignments,
    autoApprove: draft.settings.autoApproveAudio,
  } satisfies VoiceInfo;
}

function buildDurationSummary(draft: PendingProjectDraft, copy: OverviewCopy): string {
  const requestedSeconds = Number(draft.durationSeconds ?? draft.effectiveDurationSeconds ?? 0);
  const effectiveSeconds = Number(draft.effectiveDurationSeconds ?? requestedSeconds);
  if (draft.useExact) {
    return copy.durationSummaryFromScript(effectiveSeconds);
  }
  return copy.durationSummaryFromIdea(requestedSeconds, effectiveSeconds);
}

function buildSummaryItems({
  draft,
  language,
  character,
  voice,
  tokenCostBadge,
  copy,
}: {
  draft: PendingProjectDraft;
  language: LanguageInfo;
  character: CharacterInfo;
  voice: VoiceInfo;
  tokenCostBadge: string;
  copy: OverviewCopy;
}): SummaryItem[] {
  const scriptAutoEnabled = draft.settings.autoApproveScript;
  const ideaMode = !draft.useExact;
  const balanceLabel = draft.tokenBalance.toLocaleString(copy.locale);
  const requestedSeconds = Number(draft.durationSeconds ?? draft.effectiveDurationSeconds ?? 0);
  const expectedDurationLabel = ideaMode
    ? copy.expectedRuntimeBadge(requestedSeconds)
    : copy.runtimeBasedOnScriptBadge;
  const modeTooltip = ideaMode ? copy.ideaModeTooltip : copy.exactScriptTooltip;
  const hasMultipleVoiceAssignments = voice.assignments.length > 1;
  const voiceBadge = hasMultipleVoiceAssignments
    ? copy.multiLanguageVoicesBadge
    : voice.assignments[0]
      ? `${voice.assignments[0].languageLabel}: ${voice.assignments[0].voiceLabel}`
      : copy.voiceAutoBadge;
  const voiceTooltip = voice.assignments
    .map((assignment) => `${assignment.languageLabel}: ${assignment.voiceLabel}${assignment.isAuto ? copy.autoSuffix : ''}`)
    .join(', ');

  return [
    {
      key: 'cost',
      icon: Coins,
      tooltip: copy.costTooltip(tokenCostBadge, balanceLabel, draft.hasEnoughTokens),
      badge: tokenCostBadge,
      iconClass: 'bg-lime-100 text-lime-600 dark:bg-lime-950/30 dark:text-lime-300',
      containerClass: 'hover:border-lime-200 hover:bg-lime-50 dark:hover:border-lime-800 dark:hover:bg-lime-950/40',
      warning: !draft.hasEnoughTokens && !draft.groupMode,
    },
    {
      key: 'mode',
      icon: ideaMode ? Lightbulb : FileText,
      tooltip: modeTooltip,
      badge: ideaMode ? copy.ideaModeBadge : copy.exactScriptBadge,
      iconClass: ideaMode
        ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
      containerClass: ideaMode
        ? 'hover:border-amber-200 hover:bg-amber-50 dark:hover:border-amber-800 dark:hover:bg-amber-950/40'
        : 'hover:border-sky-200 hover:bg-sky-50 dark:hover:border-sky-800 dark:hover:bg-sky-950/40',
    },
    {
      key: 'duration',
      icon: Timer,
      tooltip: ideaMode
        ? copy.estimatedDurationTooltip(requestedSeconds)
        : copy.estimatedDurationFromScriptTooltip,
      badge: expectedDurationLabel,
      iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      containerClass: 'hover:border-amber-200 hover:bg-amber-50 dark:hover:border-amber-800 dark:hover:bg-amber-950/40',
    },
    {
      key: 'language',
      icon: Globe2,
      tooltip: language.tooltip,
      badge: language.badge,
      iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
      containerClass: 'hover:border-emerald-200 hover:bg-emerald-50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40',
      emoji: language.flag,
    },
    character.isDynamic
      ? {
          key: 'character',
          icon: Sparkles,
          tooltip: copy.autoCharacterSummary,
          badge: copy.autoCharacterBadge,
          iconClass: 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-white',
          containerClass: 'hover:border-violet-200 hover:bg-violet-50 dark:hover:border-violet-800 dark:hover:bg-violet-950/40',
        }
      : {
          key: 'character',
          icon: character.imageUrl ? undefined : UserRound,
          tooltip: character.summary,
          badge: character.badge,
          iconClass: character.imageUrl
            ? 'p-0 bg-transparent'
            : 'bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
          containerClass: 'hover:border-violet-200 hover:bg-violet-50 dark:hover:border-violet-800 dark:hover:bg-violet-950/40',
          render: character.imageUrl ? (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={character.imageUrl}
                alt={character.summary}
                className="max-h-full max-w-full object-contain"
                loading="lazy"
              />
            </div>
          ) : undefined,
          renderClass: character.imageUrl ? 'h-24 w-24' : undefined,
        },
    {
      key: 'voice',
      icon: Mic,
      tooltip: voiceTooltip || copy.voiceSelectionTooltip,
      badge: voiceBadge || copy.voiceAutoBadge,
      iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      containerClass: 'hover:border-amber-200 hover:bg-amber-50 dark:hover:border-amber-800 dark:hover:bg-amber-950/40',
    },
    {
      key: 'music',
      icon: Music,
      tooltip: copy.musicTooltip(draft.settings.includeDefaultMusic),
      badge: draft.settings.includeDefaultMusic ? copy.musicOnBadge : copy.musicOffBadge,
      iconClass: 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
      containerClass: 'hover:border-rose-200 hover:bg-rose-50 dark:hover:border-rose-800 dark:hover:bg-rose-950/40',
      warning: !draft.settings.includeDefaultMusic,
    },
    {
      key: 'overlay',
      icon: Layers,
      tooltip: draft.settings.addOverlay ? copy.overlayOnTooltip : copy.overlayOffTooltip,
      badge: draft.settings.addOverlay ? copy.overlayOnBadge : copy.overlayOffBadge,
      iconClass: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
      containerClass: 'hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-800 dark:hover:bg-orange-950/40',
      warning: !draft.settings.addOverlay,
    },
    {
      key: 'watermark',
      icon: Droplet,
      tooltip: (draft.settings.watermarkEnabled ?? true) ? copy.watermarkOnTooltip : copy.watermarkOffTooltip,
      badge: (draft.settings.watermarkEnabled ?? true) ? copy.watermarkOnBadge : copy.watermarkOffBadge,
      iconClass: (draft.settings.watermarkEnabled ?? true)
        ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-950/40 dark:text-slate-300',
      containerClass: (draft.settings.watermarkEnabled ?? true)
        ? 'hover:border-indigo-200 hover:bg-indigo-50 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/40'
        : 'hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-950/40',
      warning: !(draft.settings.watermarkEnabled ?? true),
    },
    {
      key: 'captions',
      icon: Subtitles,
      tooltip: (draft.settings.captionsEnabled ?? true) ? copy.captionsOnTooltip : copy.captionsOffTooltip,
      badge: (draft.settings.captionsEnabled ?? true) ? copy.captionsOnBadge : copy.captionsOffBadge,
      iconClass: (draft.settings.captionsEnabled ?? true)
        ? 'bg-teal-100 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-950/40 dark:text-slate-300',
      containerClass: (draft.settings.captionsEnabled ?? true)
        ? 'hover:border-teal-200 hover:bg-teal-50 dark:hover:border-teal-800 dark:hover:bg-teal-950/40'
        : 'hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-950/40',
      warning: !(draft.settings.captionsEnabled ?? true),
    },
    {
      key: 'cta',
      icon: Play,
      tooltip: draft.settings.includeCallToAction ? copy.ctaOnTooltip : copy.ctaOffTooltip,
      badge: draft.settings.includeCallToAction ? copy.ctaOnBadge : copy.ctaOffBadge,
      iconClass: draft.settings.includeCallToAction
        ? 'bg-lime-100 text-lime-600 dark:bg-lime-950/40 dark:text-lime-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-950/40 dark:text-slate-300',
      containerClass: draft.settings.includeCallToAction
        ? 'hover:border-lime-200 hover:bg-lime-50 dark:hover:border-lime-800 dark:hover:bg-lime-950/40'
        : 'hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-950/40',
      warning: !draft.settings.includeCallToAction,
    },
    {
      key: 'script-auto',
      icon: scriptAutoEnabled ? ShieldCheck : ClipboardList,
      tooltip: scriptAutoEnabled ? copy.scriptAutoOnTooltip : copy.scriptAutoOffTooltip,
      badge: scriptAutoEnabled ? copy.scriptAutoOnBadge : copy.scriptAutoOffBadge,
      iconClass: scriptAutoEnabled
        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-gray-200 text-gray-600 dark:bg-gray-900/60 dark:text-gray-300',
      containerClass: scriptAutoEnabled
        ? 'hover:border-emerald-200 hover:bg-emerald-50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40'
        : 'border-gray-200 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-800 dark:hover:bg-gray-900/60',
      warning: !scriptAutoEnabled,
    },
    {
      key: 'audio-auto',
      icon: voice.autoApprove ? Mic : MicOff,
      tooltip: voice.autoApprove ? copy.audioAutoOnTooltip : copy.audioAutoOffTooltip,
      badge: voice.autoApprove ? copy.audioAutoOnBadge : copy.audioAutoOffBadge,
      iconClass: voice.autoApprove
        ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
        : 'bg-gray-200 text-gray-600 dark:bg-gray-900/60 dark:text-gray-300',
      containerClass: voice.autoApprove
        ? 'hover:border-blue-200 hover:bg-blue-50 dark:hover:border-blue-800 dark:hover:bg-blue-950/40'
        : 'border-gray-200 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-gray-800 dark:hover:bg-gray-900/60',
      warning: !voice.autoApprove,
    },
  ];
}

function buildGuidanceSections(draft: PendingProjectDraft, copy: OverviewCopy): GuidanceSection[] {
  const options: GuidanceSection[] = [
    {
      key: 'creation',
      label: copy.guidanceCreationLabel,
      enabled: draft.settings.scriptCreationGuidanceEnabled,
      text: draft.settings.scriptCreationGuidance,
      iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
      hoverClass: 'hover:border-amber-200 hover:bg-amber-50 dark:hover:border-amber-800 dark:hover:bg-amber-950/40',
      icon: Sparkles,
      tags: [copy.guidanceCreationTag],
    },
    {
      key: 'avoidance',
      label: copy.guidanceAvoidanceLabel,
      enabled: draft.settings.scriptAvoidanceGuidanceEnabled,
      text: draft.settings.scriptAvoidanceGuidance,
      iconClass: 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
      hoverClass: 'hover:border-rose-200 hover:bg-rose-50 dark:hover:border-rose-800 dark:hover:bg-rose-950/40',
      icon: Ban,
      tags: [copy.guidanceAvoidanceTag],
    },
  ];
  if (features.audioTonePromptEnabled) {
    options.push({
      key: 'audio',
      label: copy.guidanceAudioLabel,
      enabled: draft.settings.audioStyleGuidanceEnabled,
      text: draft.settings.audioStyleGuidance,
      iconClass: 'bg-teal-100 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300',
      hoverClass: 'hover:border-teal-200 hover:bg-teal-50 dark:hover:border-teal-800 dark:hover:bg-teal-950/40',
      icon: AudioLines,
      tags: [copy.guidanceAudioTag],
    });
  }
  return options.filter((item) => item.enabled && item.text && item.text.trim().length > 0);
}
