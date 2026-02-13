"use client";
import { useEffect, useId, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Music, Layers, FileCheck2, Mic, Sparkles, AudioLines, Droplet, Subtitles, Megaphone } from 'lucide-react';
import { LIMITS } from '@/shared/constants/limits';
import { features } from '@/lib/feature-flags';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type SettingsPopoverCopy = {
  scriptAndAudioConfigured: string;
  scriptGuidanceOn: string;
  audioGuidanceOn: string;
  allOff: string;
  includeDefaultMusic: string;
  addOverlay: string;
  showWatermark: string;
  addCaptions: string;
  autoApproveScript: string;
  autoApproveVoiceover: string;
  includeCallToAction: string;
  aiGuidance: string;
  guidanceDialogTitle: string;
  guidanceDialogDescription: string;
  scriptCreationPromptTitle: string;
  scriptCreationPromptDescription: string;
  toggleCreationGuidance: string;
  llmCreationGuidance: string;
  scriptCreationPlaceholder: string;
  audioTonePromptTitle: string;
  audioTonePromptDescription: string;
  toggleAudioStyleGuidance: string;
  audioStyleGuidance: string;
  audioStylePlaceholder: string;
  audioAppliedHint: string;
  close: string;
};

const COPY: Record<AppLanguageCode, SettingsPopoverCopy> = {
  en: {
    scriptAndAudioConfigured: 'Script & audio configured',
    scriptGuidanceOn: 'Script guidance on',
    audioGuidanceOn: 'Audio guidance on',
    allOff: 'All off',
    includeDefaultMusic: 'Include default music',
    addOverlay: 'Add overlay',
    showWatermark: 'Show watermark',
    addCaptions: 'Add captions',
    autoApproveScript: 'Auto approve script',
    autoApproveVoiceover: 'Auto approve voiceover',
    includeCallToAction: 'Include Call to Action',
    aiGuidance: 'AI guidance',
    guidanceDialogTitle: 'AI guidance for scripts & audio',
    guidanceDialogDescription: 'Configure helper prompts that steer script creation and voiceover tone for every project.',
    scriptCreationPromptTitle: 'Script creation prompt',
    scriptCreationPromptDescription: 'Give the language model north-star guidance for tone, pacing, or structure when it writes scripts.',
    toggleCreationGuidance: 'Toggle creation guidance',
    llmCreationGuidance: 'LLM creation guidance',
    scriptCreationPlaceholder: 'Add instructions to guide script creation',
    audioTonePromptTitle: 'Audio tone prompt',
    audioTonePromptDescription: 'Share the vibe you want for voiceover takes-for example speaker energy, pacing, or accents.',
    toggleAudioStyleGuidance: 'Toggle audio style guidance',
    audioStyleGuidance: 'Audio style guidance',
    audioStylePlaceholder: 'Example: Warm documentary narrator with gentle optimism',
    audioAppliedHint: 'Applied to every generated voiceover when enabled.',
    close: 'Close',
  },
  ru: {
    scriptAndAudioConfigured: 'Сценарий и аудио настроены',
    scriptGuidanceOn: 'Настройки сценария включены',
    audioGuidanceOn: 'Настройки аудио включены',
    allOff: 'Все выкл',
    includeDefaultMusic: 'Добавить музыку по умолчанию',
    addOverlay: 'Добавить оверлей',
    showWatermark: 'Показывать ватермарку',
    addCaptions: 'Добавить субтитры',
    autoApproveScript: 'Автоподтверждение сценария',
    autoApproveVoiceover: 'Автоподтверждение озвучки',
    includeCallToAction: 'Добавить призыв к действию',
    aiGuidance: 'ИИ-настройки',
    guidanceDialogTitle: 'ИИ-настройки для сценария и аудио',
    guidanceDialogDescription: 'Настройте подсказки, которые направляют генерацию сценария и тон озвучки для каждого проекта.',
    scriptCreationPromptTitle: 'Подсказка для создания сценария',
    scriptCreationPromptDescription: 'Задайте ориентиры по тону, темпу и структуре, когда модель пишет сценарий.',
    toggleCreationGuidance: 'Переключить настройки сценария',
    llmCreationGuidance: 'Настройки сценария',
    scriptCreationPlaceholder: 'Добавьте инструкции для генерации сценария',
    audioTonePromptTitle: 'Подсказка для тона озвучки',
    audioTonePromptDescription: 'Опишите желаемую подачу озвучки: например, энергичность, темп и акцент.',
    toggleAudioStyleGuidance: 'Переключить настройки аудио',
    audioStyleGuidance: 'Настройки озвучки',
    audioStylePlaceholder: 'Пример: теплый документальный диктор со спокойной подачей',
    audioAppliedHint: 'Применяется ко всем озвучкам, пока включено.',
    close: 'Закрыть',
  },
};

export function SettingsPopover({
  disabledAutoApprove,
}: {
  disabledAutoApprove?: boolean;
}) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const { settings, update } = useSettings();
  const [creationGuide, setCreationGuide] = useState('');
  const [audioStyleGuide, setAudioStyleGuide] = useState('');
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const creationId = useId();
  const audioId = useId();

  useEffect(() => {
    if (!settings) return;
    setCreationGuide(settings.scriptCreationGuidance ?? '');
  }, [settings?.scriptCreationGuidance, settings]);


  useEffect(() => {
    if (!settings) return;
    setAudioStyleGuide(settings.audioStyleGuidance ?? '');
  }, [settings?.audioStyleGuidance, settings]);

  const creationCount = useMemo(() => creationGuide.length, [creationGuide]);
  const audioCount = useMemo(() => audioStyleGuide.length, [audioStyleGuide]);
  const audioTonePromptEnabled = features.audioTonePromptEnabled;

  if (!settings) return null;

  const handleGuidanceBlur = (
    key: 'scriptCreationGuidance' | 'scriptAvoidanceGuidance' | 'audioStyleGuidance',
    value: string,
  ) => {
    if (settings[key] === value) return;
    void update(key, value);
  };

  const scriptConfigured = !!settings.scriptCreationGuidanceEnabled || !!settings.scriptAvoidanceGuidanceEnabled;
  const audioConfigured = audioTonePromptEnabled
    ? (!!settings.audioStyleGuidanceEnabled && (settings.audioStyleGuidance?.trim()?.length ?? 0) > 0)
    : false;
  const guidanceSummary = (() => {
    if (scriptConfigured && audioConfigured) return copy.scriptAndAudioConfigured;
    if (scriptConfigured) return copy.scriptGuidanceOn;
    if (audioConfigured) return copy.audioGuidanceOn;
    return copy.allOff;
  })();

  return (
    <>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Music className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.includeDefaultMusic}</span>
          </div>
          <Switch checked={!!settings.includeDefaultMusic} onCheckedChange={(v) => update('includeDefaultMusic', !!v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.addOverlay}</span>
          </div>
          <Switch checked={!!settings.addOverlay} onCheckedChange={(v) => update('addOverlay', !!v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Droplet className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.showWatermark}</span>
          </div>
          <Switch checked={!!settings.watermarkEnabled} onCheckedChange={(v) => update('watermarkEnabled', !!v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Subtitles className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.addCaptions}</span>
          </div>
          <Switch checked={!!settings.captionsEnabled} onCheckedChange={(v) => update('captionsEnabled', !!v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck2 className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.autoApproveScript}</span>
          </div>
          <Switch
            checked={!!settings.autoApproveScript}
            disabled={!!disabledAutoApprove}
            onCheckedChange={(v) => update('autoApproveScript', !!v)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mic className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.autoApproveVoiceover}</span>
          </div>
          <Switch
            checked={!!settings.autoApproveAudio}
            disabled={!!disabledAutoApprove}
            onCheckedChange={(v) => update('autoApproveAudio', !!v)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Megaphone className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="truncate">{copy.includeCallToAction}</span>
          </div>
          <Switch checked={!!settings.includeCallToAction} onCheckedChange={(v) => update('includeCallToAction', !!v)} />
        </div>
        <Separator />
        <Button
          variant="outline"
          size="sm"
          className="justify-between"
          onClick={() => setGuidanceOpen(true)}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {copy.aiGuidance}
          </span>
          <span className="text-xs text-muted-foreground">{guidanceSummary}</span>
        </Button>
      </div>

      <Dialog open={guidanceOpen} onOpenChange={setGuidanceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.guidanceDialogTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              {copy.guidanceDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-6 text-sm">
            <section className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-5">{copy.scriptCreationPromptTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.scriptCreationPromptDescription}
                  </p>
                </div>
                <Switch
                  aria-label={copy.toggleCreationGuidance}
                  checked={!!settings.scriptCreationGuidanceEnabled}
                  onCheckedChange={(value) => update('scriptCreationGuidanceEnabled', !!value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={creationId} className="sr-only">
                  {copy.llmCreationGuidance}
                </Label>
                <Textarea
                  id={creationId}
                  value={creationGuide}
                  onChange={(event) => setCreationGuide(event.target.value)}
                  onBlur={(event) => handleGuidanceBlur('scriptCreationGuidance', event.target.value)}
                  placeholder={copy.scriptCreationPlaceholder}
                  disabled={!settings.scriptCreationGuidanceEnabled}
                  maxLength={LIMITS.scriptGuidanceMax}
                  className="min-h-[80px] resize-vertical"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {creationCount}/{LIMITS.scriptGuidanceMax}
                </p>
              </div>
            </section>

            {audioTonePromptEnabled ? (
              <>
                <Separator />
                <section className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-5">{copy.audioTonePromptTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {copy.audioTonePromptDescription}
                      </p>
                    </div>
                    <Switch
                      aria-label={copy.toggleAudioStyleGuidance}
                      checked={!!settings.audioStyleGuidanceEnabled}
                      onCheckedChange={(value) => update('audioStyleGuidanceEnabled', !!value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={audioId} className="sr-only">
                      {copy.audioStyleGuidance}
                    </Label>
                    <Textarea
                      id={audioId}
                      value={audioStyleGuide}
                      onChange={(event) => setAudioStyleGuide(event.target.value)}
                      onBlur={(event) => handleGuidanceBlur('audioStyleGuidance', event.target.value)}
                      placeholder={copy.audioStylePlaceholder}
                      disabled={!settings.audioStyleGuidanceEnabled}
                      maxLength={LIMITS.audioStyleGuidanceMax}
                      className="min-h-[80px] resize-vertical"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <AudioLines className="h-3.5 w-3.5" />
                        <span>{copy.audioAppliedHint}</span>
                      </div>
                      <span>{audioCount}/{LIMITS.audioStyleGuidanceMax}</span>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setGuidanceOpen(false)}>
              {copy.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
