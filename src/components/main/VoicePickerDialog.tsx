"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Loader2, XCircle, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useVoices, type VoiceOption } from '@/hooks/useVoices';
import { useVoicePreview } from '@/hooks/useVoicePreview';
import { DEFAULT_LANGUAGE, getLanguageFlag, getLanguageLabel, type TargetLanguageCode } from '@/shared/constants/languages';
import { VOICE_PROVIDERS, VOICE_PROVIDER_LABELS, type VoiceProviderId } from '@/shared/constants/voice-providers';
import { voiceSupportsLanguage } from '@/shared/voices/client-utils';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';
import { localizeVoiceOption } from '@/components/main/voice-translations';

const AUTO_VALUE = '__auto__';
type ProviderFilter = 'all' | VoiceProviderId;

type VoicePickerCopy = {
  dialogTitle: string;
  dialogDescription: string;
  currentSelection: string;
  allProviders: string;
  providerVoices: (providerLabel: string) => string;
  autoVoice: string;
  autoLabel: (voiceName?: string | null) => string;
  autoDescriptionWithVoice: (voiceName: string, languageLabel: string) => string;
  autoDescriptionNoVoice: (languageLabel: string) => string;
  women: string;
  men: string;
  other: string;
  loadingVoices: string;
  noVoicesForLanguage: string;
  failedToUpdateVoicePreference: string;
  female: string;
  male: string;
  fast: string;
  slow: string;
};

const COPY: Record<AppLanguageCode, VoicePickerCopy> = {
  en: {
    dialogTitle: 'Choose voice',
    dialogDescription: 'Tap a row to select. Use Play to preview.',
    currentSelection: 'Current selection',
    allProviders: 'All providers',
    providerVoices: (providerLabel) => `${providerLabel} voices`,
    autoVoice: 'Auto voice',
    autoLabel: (voiceName) => `Auto${voiceName ? ` (${voiceName})` : ''}`,
    autoDescriptionWithVoice: (voiceName, languageLabel) =>
      `We automatically use ${voiceName} for ${languageLabel} until you pick a different voice.`,
    autoDescriptionNoVoice: (languageLabel) => `We automatically pick the best voice for ${languageLabel}.`,
    women: 'Women',
    men: 'Men',
    other: 'Other',
    loadingVoices: 'Loading voices…',
    noVoicesForLanguage: 'No voices are available for this language yet.',
    failedToUpdateVoicePreference: 'Failed to update voice preference',
    female: 'Female',
    male: 'Male',
    fast: 'Fast',
    slow: 'Slow',
  },
  ru: {
    dialogTitle: 'Выберите голос',
    dialogDescription: 'Нажмите на строку, чтобы выбрать. Нажмите Play, чтобы прослушать.',
    currentSelection: 'Текущий выбор',
    allProviders: 'Все провайдеры',
    providerVoices: (providerLabel) => `Голоса ${providerLabel}`,
    autoVoice: 'Автоголос',
    autoLabel: (voiceName) => `Авто${voiceName ? ` (${voiceName})` : ''}`,
    autoDescriptionWithVoice: (voiceName, languageLabel) =>
      `Мы автоматически используем голос ${voiceName} для языка ${languageLabel}, пока вы не выберете другой.`,
    autoDescriptionNoVoice: (languageLabel) => `Мы автоматически подберем лучший голос для языка ${languageLabel}.`,
    women: 'Женские',
    men: 'Мужские',
    other: 'Другие',
    loadingVoices: 'Загружаем голоса…',
    noVoicesForLanguage: 'Для этого языка пока нет доступных голосов.',
    failedToUpdateVoicePreference: 'Не удалось обновить голос',
    female: 'Женский',
    male: 'Мужской',
    fast: 'Быстрый',
    slow: 'Медленный',
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

type VoicePickerDialogProps = {
  open: boolean;
  languageCode: string | null;
  onOpenChange: (open: boolean) => void;
  selectedVoiceId: string | null;
  onSelect: (voiceId: string | null) => Promise<void> | void;
};

function normalizeVoiceProvider(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getVoiceProviderLabel(provider: string | null | undefined): string | null {
  const normalized = normalizeVoiceProvider(provider);
  if (!normalized) return null;
  return (VOICE_PROVIDER_LABELS as Record<string, string>)[normalized] ?? provider?.trim() ?? null;
}

function formatVoiceSummary(voice: VoiceOption, copy: VoicePickerCopy): string {
  const parts: string[] = [];
  if (voice.gender) parts.push(voice.gender === 'female' ? copy.female : copy.male);
  if (voice.speed) parts.push(voice.speed === 'fast' ? copy.fast : copy.slow);
  const providerLabel = getVoiceProviderLabel(voice.voiceProvider);
  if (providerLabel) parts.push(providerLabel);
  return parts.join(' · ');
}

export function VoicePickerDialog({ open, languageCode, onOpenChange, selectedVoiceId, onSelect }: VoicePickerDialogProps) {
  const { language: appLanguage } = useAppLanguage();
  const copy = COPY[appLanguage];
  const { voices, loading, getByExternalId, getAutoVoice } = useVoices();
  const { playingId, isPlaying, togglePlay, stop } = useVoicePreview();
  const activeLanguage = (languageCode ?? DEFAULT_LANGUAGE) as TargetLanguageCode;
  const languageLabel = LANGUAGE_LABELS_BY_UI[appLanguage][activeLanguage] ?? getLanguageLabel(activeLanguage);
  const languageFlag = getLanguageFlag(activeLanguage);
  const autoVoice = getAutoVoice(activeLanguage);
  const localizedAutoVoice = autoVoice ? localizeVoiceOption(autoVoice, appLanguage) : null;
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const voiceRefs = useRef<Record<string, HTMLLabelElement | null>>({});
  const registerVoiceRef = useCallback((key: string) => (node: HTMLLabelElement | null) => {
    if (node) {
      voiceRefs.current[key] = node;
    } else {
      delete voiceRefs.current[key];
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
    }
  }, [open, stop]);

  useEffect(() => {
    setProviderFilter('all');
  }, [activeLanguage]);

  const languageCompatibleVoices = useMemo(() => {
    if (!voices.length) return [];
    return voices.filter((voice) => voiceSupportsLanguage(voice, activeLanguage));
  }, [voices, activeLanguage]);

  const filteredVoices = useMemo(() => {
    if (providerFilter === 'all') return languageCompatibleVoices;
    return languageCompatibleVoices.filter((voice) => normalizeVoiceProvider(voice.voiceProvider) === providerFilter);
  }, [languageCompatibleVoices, providerFilter]);

  const providerAvailability = useMemo(() => {
    const availability: Record<VoiceProviderId, boolean> = {
      inworld: false,
      minimax: false,
      elevenlabs: false,
    };
    for (const provider of VOICE_PROVIDERS) {
      availability[provider.id] = languageCompatibleVoices.some(
        (voice) => normalizeVoiceProvider(voice.voiceProvider) === provider.id
      );
    }
    return availability;
  }, [languageCompatibleVoices]);

  const currentSelection = useMemo(() => {
    if (!selectedVoiceId) return null;
    return getByExternalId(selectedVoiceId) ?? voices.find((voice) => voice.id === selectedVoiceId) ?? null;
  }, [selectedVoiceId, getByExternalId, voices]);

  const femaleVoices = filteredVoices.filter((voice) => voice.gender === 'female');
  const maleVoices = filteredVoices.filter((voice) => voice.gender === 'male');
  const otherVoices = filteredVoices.filter((voice) => voice.gender !== 'female' && voice.gender !== 'male');

  const currentSelectionLabel = currentSelection
    ? localizeVoiceOption(currentSelection, appLanguage).title
    : localizedAutoVoice
      ? copy.autoLabel(localizedAutoVoice.title)
      : copy.autoVoice;

  const handleSelect = async (value: string) => {
    const resolved = value === AUTO_VALUE ? null : value;
    const canonical = resolved
      ? (() => {
          const match = voices.find((voice) => (voice.externalId ?? voice.id) === resolved);
          return match?.externalId ?? resolved;
        })()
      : null;
    try {
      await onSelect(canonical);
    } catch (err) {
      toast.error(copy.failedToUpdateVoicePreference, { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const autoPreviewTarget = autoVoice
    ? {
        id: `auto-${activeLanguage}`,
        externalId: autoVoice.externalId,
        previewPath: autoVoice.previewPath,
        title: localizedAutoVoice?.title ?? autoVoice.title,
      }
    : null;

  const renderVoiceRow = (voice: VoiceOption) => {
    const voiceKey = voice.externalId ?? voice.id;
    const localizedVoice = localizeVoiceOption(voice, appLanguage);
    const summary = formatVoiceSummary(voice, copy);
    const previewTarget = {
      id: voiceKey,
      externalId: voice.externalId,
      previewPath: voice.previewPath,
      title: localizedVoice.title,
    };
    return (
      <label
        key={voice.id}
        ref={registerVoiceRef(voiceKey)}
        className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/40"
      >
        <div className="pt-1">
          <RadioGroupItem value={voiceKey} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{localizedVoice.title}</span>
            {summary ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-200">
                {summary}
              </span>
            ) : null}
          </div>
          {localizedVoice.description ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">{localizedVoice.description}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            togglePlay(previewTarget);
          }}
        >
          {playingId === previewTarget.id && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      </label>
    );
  };

  const groupedSections = [
    { title: copy.women, voices: femaleVoices },
    { title: copy.men, voices: maleVoices },
    { title: copy.other, voices: otherVoices },
  ].filter((section) => section.voices.length > 0);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  useLayoutEffect(() => {
    if (!open || loading) return;
    const key = selectedVoiceId ?? AUTO_VALUE;
    const node = voiceRefs.current[key];
    if (node && typeof node.scrollIntoView === 'function') {
      const frame = requestAnimationFrame(() => {
        try {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch {
          node.scrollIntoView({ block: 'center' });
        }
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open, loading, selectedVoiceId, filteredVoices.length, providerFilter, activeLanguage]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[4%] bottom-[3%] sm:top-[6%] sm:bottom-[4%] lg:top-[7%] lg:bottom-[5%] max-w-3xl flex flex-col overflow-hidden">
        <DialogHeader className="mb-3 flex-col items-start gap-1 text-left">
          <DialogTitle className="text-lg font-semibold leading-tight">{copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-700 shadow-sm dark:bg-gray-950 dark:text-gray-100">
                    <span className="text-base leading-none">{languageFlag}</span> {languageLabel}
                  </span>
                </div>
                <p className="mt-1">
                  {copy.currentSelection}:{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{currentSelectionLabel}</span>
                </p>
              </div>
              <div className="w-full sm:w-auto">
                <Select value={providerFilter} onValueChange={(value) => setProviderFilter(value as ProviderFilter)}>
                  <SelectTrigger className="w-full sm:w-52">
                    <SelectValue placeholder={copy.allProviders} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.allProviders}</SelectItem>
                    {VOICE_PROVIDERS.filter((provider) => providerAvailability[provider.id]).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {copy.providerVoices(provider.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-600 dark:text-gray-300">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {copy.loadingVoices}
            </div>
            ) : filteredVoices.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-gray-600 dark:text-gray-300">
              <XCircle className="h-6 w-6 text-gray-400" />
              <p>{copy.noVoicesForLanguage}</p>
            </div>
            ) : (
              <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1 pb-2 md:pb-4 overscroll-contain touch-pan-y [scrollbar-gutter:stable_both-edges]">
              <RadioGroup
                value={selectedVoiceId ?? AUTO_VALUE}
                onValueChange={(value) => {
                  void handleSelect(value);
                }}
              >
                <div className="flex flex-col gap-3">
                  <label
                    ref={registerVoiceRef(AUTO_VALUE)}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/40"
                  >
                    <div className="pt-1">
                      <RadioGroupItem value={AUTO_VALUE} />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {copy.autoLabel(localizedAutoVoice?.title)}
                      </span>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {localizedAutoVoice
                          ? copy.autoDescriptionWithVoice(localizedAutoVoice.title, languageLabel)
                          : copy.autoDescriptionNoVoice(languageLabel)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8"
                      disabled={!autoPreviewTarget}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (autoPreviewTarget) {
                          togglePlay(autoPreviewTarget);
                        }
                      }}
                    >
                      {autoPreviewTarget && playingId === autoPreviewTarget.id && isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </label>
                  {groupedSections.map((section, index) => {
                    const collapsed = !!collapsedSections[section.title];
                    return (
                      <div key={section.title} className="flex flex-col gap-1 px-1">
                        <button
                          type="button"
                          className="flex items-center justify-between rounded-md border border-transparent px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 transition-all hover:border-gray-200 hover:bg-gray-100/70 hover:text-gray-900 dark:hover:border-gray-800 dark:hover:bg-gray-900/60 dark:text-gray-400 dark:hover:text-gray-200"
                          aria-expanded={!collapsed}
                          onClick={() => toggleSection(section.title)}
                        >
                          <span>{section.title}</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                        </button>
                        {!collapsed ? section.voices.map((voice) => renderVoiceRow(voice)) : null}
                        {index < groupedSections.length - 1 ? <Separator className="mx-4" /> : null}
                      </div>
                    );
                  })}
                </div>
              </RadioGroup>
            </div>
            )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
