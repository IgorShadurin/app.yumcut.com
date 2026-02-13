"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, Pause, Play, Globe } from 'lucide-react';
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  TargetLanguageCode,
  getLanguageLabel,
  getLanguageFlag,
  normalizeLanguageList,
  resolvePrimaryLanguage,
} from '@/shared/constants/languages';
import type { VoiceOption } from '@/hooks/useVoices';
import { useVoicePreview } from '@/hooks/useVoicePreview';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type Props = {
  values?: TargetLanguageCode[] | string[] | null;
  onChange: (codes: TargetLanguageCode[]) => void;
  languageVoices?: Partial<Record<TargetLanguageCode, string | null>>;
  onVoiceClick?: (language: TargetLanguageCode) => void;
  resolveVoiceOption?: (voiceId: string | null) => VoiceOption | null;
  autoVoices?: Partial<Record<TargetLanguageCode, VoiceOption | null>>;
  voiceModalOpen?: boolean;
};

type LanguageDropdownCopy = {
  allLanguages: string;
  targetLanguagesTitle: string;
  auto: string;
  voiceFallback: string;
  autoVoiceTitle: string;
  customVoiceTitle: string;
  previewVoice: (languageLabel: string) => string;
  previewVoiceNamed: (voiceTitle: string) => string;
  selectLanguage: (languageLabel: string) => string;
  deselectLanguage: (languageLabel: string) => string;
};

const COPY: Record<AppLanguageCode, LanguageDropdownCopy> = {
  en: {
    allLanguages: 'All languages',
    targetLanguagesTitle: 'Target languages for script, audio, and video',
    auto: 'Auto',
    voiceFallback: 'Voice',
    autoVoiceTitle: 'Auto voice',
    customVoiceTitle: 'Custom voice',
    previewVoice: (languageLabel) => `Preview ${languageLabel} voice`,
    previewVoiceNamed: (voiceTitle) => `Preview ${voiceTitle}`,
    selectLanguage: (languageLabel) => `Select ${languageLabel}`,
    deselectLanguage: (languageLabel) => `Deselect ${languageLabel}`,
  },
  ru: {
    allLanguages: 'Все языки',
    targetLanguagesTitle: 'Языки для сценария, озвучки и видео',
    auto: 'Авто',
    voiceFallback: 'Голос',
    autoVoiceTitle: 'Автоголос',
    customVoiceTitle: 'Свой голос',
    previewVoice: (languageLabel) => `Прослушать голос: ${languageLabel}`,
    previewVoiceNamed: (voiceTitle) => `Прослушать: ${voiceTitle}`,
    selectLanguage: (languageLabel) => `Выбрать ${languageLabel}`,
    deselectLanguage: (languageLabel) => `Убрать ${languageLabel}`,
  },
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

function summarizeSelection(
  selection: TargetLanguageCode[],
  getLabel: (code: TargetLanguageCode) => string,
  allLanguagesLabel: string,
): string {
  if (selection.length === 0) return getLabel(DEFAULT_LANGUAGE);
  if (selection.length === 1) return getLabel(selection[0]);

  const selectionSet = new Set(selection);
  const includesEveryLanguage = selectionSet.size === LANGUAGES.length && LANGUAGES.every((lang) => selectionSet.has(lang.code));
  if (includesEveryLanguage) return allLanguagesLabel;

  const [first, ...rest] = selection;
  return `${getLabel(first)} +${rest.length}`;
}

const VOICE_NAME_LIMIT = 7;

function formatVoiceButtonLabel(name: string | null | undefined, fallback: string) {
  if (!name) return fallback;
  return name.length <= VOICE_NAME_LIMIT ? name : `${name.slice(0, VOICE_NAME_LIMIT)}…`;
}

export function LanguageDropdown({
  values,
  onChange,
  languageVoices,
  onVoiceClick,
  resolveVoiceOption,
  autoVoices,
  voiceModalOpen = false,
}: Props) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const getUiLanguageLabel = useCallback(
    (code: TargetLanguageCode) => LANGUAGE_LABELS_BY_UI[language][code] || getLanguageLabel(code),
    [language],
  );
  const normalized = useMemo(
    () => normalizeLanguageList(values ?? [], DEFAULT_LANGUAGE),
    [values],
  );
  const [open, setOpen] = useState(false);
  const preventCloseRef = useRef(false);
  const preventCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playingId, isPlaying, togglePlay, stop } = useVoicePreview();
  useEffect(() => {
    if (!open) {
      stop();
    }
  }, [open, stop]);

  useEffect(
    () => () => {
      if (preventCloseTimeoutRef.current) {
        clearTimeout(preventCloseTimeoutRef.current);
        preventCloseTimeoutRef.current = null;
      }
    },
    []
  );

  const sustainPopoverOpen = useCallback(() => {
    preventCloseRef.current = true;
    if (preventCloseTimeoutRef.current) {
      clearTimeout(preventCloseTimeoutRef.current);
    }
    preventCloseTimeoutRef.current = setTimeout(() => {
      preventCloseRef.current = false;
      preventCloseTimeoutRef.current = null;
    }, 600);
  }, []);

  const handlePopoverOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (preventCloseRef.current || voiceModalOpen)) {
        return;
      }
      setOpen(next);
    },
    [voiceModalOpen]
  );

  const primary = resolvePrimaryLanguage(normalized, DEFAULT_LANGUAGE);

  function applyChange(next: TargetLanguageCode[]) {
    const normalizedNext = normalizeLanguageList(next, primary);
    onChange(normalizedNext);
  }

  function handleSelect(code: TargetLanguageCode) {
    const exists = normalized.includes(code);
    if (exists) {
      if (normalized.length === 1) return;
      const next = normalized.filter((c) => c !== code);
      applyChange(next.length ? next : [code]);
    } else {
      applyChange([...normalized, code]);
    }
  }

  const selectionLabel = summarizeSelection(normalized, getUiLanguageLabel, copy.allLanguages);
  const isMultilingual = normalized.length > 1;

  return (
    <Popover open={open} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={copy.targetLanguagesTitle}
          className={cn(
            'relative rounded-full h-8 px-3 text-sm font-normal',
            isMultilingual ? 'border-blue-200 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40' : '',
          )}
        >
          <div className="flex items-center gap-1">
            <Globe className="h-4 w-4" />
            <span className="truncate max-w-[120px]">{selectionLabel}</span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent collisionPadding={16} className="w-[calc(100vw-1.5rem)] max-w-[480px] p-3 sm:w-96" align="center">
        <div className="max-h-[65vh] sm:max-h-80 overflow-y-auto px-2 pr-3">
          <div className="flex flex-col gap-1">
            {LANGUAGES.map((lang) => {
              const checked = normalized.includes(lang.code);
              const languageLabel = getUiLanguageLabel(lang.code);
              const voiceId = languageVoices?.[lang.code] ?? null;
              const resolvedVoice = voiceId ? resolveVoiceOption?.(voiceId) ?? null : null;
              const autoVoice = autoVoices?.[lang.code] ?? null;
              const hasCustomVoice = !!voiceId && !!resolvedVoice;
              const voiceButtonLabel = hasCustomVoice
                ? formatVoiceButtonLabel(resolvedVoice?.title ?? voiceId ?? copy.voiceFallback, copy.voiceFallback)
                : copy.auto;
              const previewTarget = resolvedVoice
                ? {
                    id: resolvedVoice.externalId ?? voiceId ?? `custom-${lang.code}`,
                    externalId: resolvedVoice.externalId ?? voiceId ?? null,
                    previewPath: resolvedVoice.previewPath ?? null,
                    title: resolvedVoice.title,
                  }
                : autoVoice
                  ? {
                      id: `auto-${lang.code}`,
                      externalId: autoVoice.externalId,
                      previewPath: autoVoice.previewPath,
                      title: autoVoice.title,
                    }
                  : null;
              const voiceSubtitle = hasCustomVoice
                ? (resolvedVoice?.title ?? voiceId)
                : autoVoice?.title ?? null;
              const previewDisabled = !previewTarget;
              return (
                <div key={lang.code} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                      checked
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                    )}
                    onClick={() => handleSelect(lang.code)}
                    aria-pressed={checked}
                  >
                      <span className="flex items-center gap-1 min-w-0">
                        <span>{getLanguageFlag(lang.code)}</span>
                        <span className="truncate">{languageLabel}</span>
                      </span>
                      <span
                        className={cn(
                          'ml-auto flex h-4 w-4 items-center justify-center rounded-sm border border-gray-300 dark:border-gray-700 transition-colors',
                          checked ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-transparent border-transparent',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="sr-only">
                        {checked ? copy.deselectLanguage(languageLabel) : copy.selectLanguage(languageLabel)}
                      </span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          'relative min-w-[92px] justify-center text-xs font-medium',
                          hasCustomVoice
                            ? 'border-blue-200 text-blue-700 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/40'
                            : 'text-gray-600 dark:text-gray-200'
                        )}
                        disabled={!checked || !onVoiceClick}
                        title={hasCustomVoice ? voiceSubtitle ?? copy.customVoiceTitle : autoVoice ? `${copy.autoVoiceTitle}: ${autoVoice.title}` : copy.autoVoiceTitle}
                        onClick={() => {
                          sustainPopoverOpen();
                          stop();
                          onVoiceClick?.(lang.code);
                        }}
                      >
                        {voiceButtonLabel}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={voiceSubtitle ? copy.previewVoiceNamed(voiceSubtitle) : copy.previewVoice(languageLabel)}
                        disabled={previewDisabled}
                        onClick={() => {
                          if (previewTarget) {
                            togglePlay(previewTarget);
                          }
                        }}
                      >
                        {previewTarget && playingId === previewTarget.id && isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
