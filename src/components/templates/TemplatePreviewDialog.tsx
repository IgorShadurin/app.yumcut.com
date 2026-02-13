"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/hooks/useSettings';
import { useVoices } from '@/hooks/useVoices';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type TemplatePreviewCopy = {
  dialogDescription: string;
  videoPreview: string;
  voice: string;
  captions: string;
  overlay: string;
  art: string;
  defaultVoice: string;
  none: string;
  cancel: string;
  useIt: string;
  close: string;
};

const COPY: Record<AppLanguageCode, TemplatePreviewCopy> = {
  en: {
    dialogDescription: 'Preview the template video and review voice, captions, overlay, and art details before applying it.',
    videoPreview: 'Video preview',
    voice: 'Voice',
    captions: 'Captions',
    overlay: 'Overlay',
    art: 'Art',
    defaultVoice: 'Default voice',
    none: 'None',
    cancel: 'Cancel',
    useIt: 'Use It',
    close: 'Close',
  },
  ru: {
    dialogDescription: 'Просмотрите видео шаблона и проверьте голос, субтитры, оверлей и стиль перед применением.',
    videoPreview: 'Предпросмотр видео',
    voice: 'Голос',
    captions: 'Субтитры',
    overlay: 'Оверлей',
    art: 'Стиль',
    defaultVoice: 'Голос по умолчанию',
    none: 'Нет',
    cancel: 'Отмена',
    useIt: 'Использовать',
    close: 'Закрыть',
  },
};

const TITLE_TRANSLATIONS_RU: Record<string, string> = {
  'Basic Effects': 'Базовые эффекты',
};

const DESCRIPTION_TRANSLATIONS_RU: Record<string, string> = {
  'Classic pans, zooms, and simple overlays to give stories a clean, polished lift.':
    'Классические панорамы, зумы и простые оверлеи, чтобы придать ролику аккуратный и профессиональный вид.',
};

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  title,
  videoUrl,
  description,
  onUse,
  voiceTitle,
  captionsTitle,
  overlayTitle,
  artStyleTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  videoUrl: string;
  description?: string | null;
  onUse?: () => void;
  voiceTitle?: string | null;
  captionsTitle?: string | null;
  overlayTitle?: string | null;
  artStyleTitle?: string | null;
}) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const { settings } = useSettings();
  const { getByExternalId, defaultVoiceId } = useVoices();

  const providedVoiceTitle = (voiceTitle || '')?.trim();
  const fallbackVoiceExtId = settings?.preferredVoiceId || defaultVoiceId || null;
  const fallbackVoiceTitle = fallbackVoiceExtId ? (getByExternalId(fallbackVoiceExtId)?.title ?? null) : null;
  const effectiveVoiceTitle = providedVoiceTitle || fallbackVoiceTitle || copy.defaultVoice;
  const effectiveCaptionsTitle = (captionsTitle || '').trim() || copy.none;
  const effectiveOverlayTitle = (overlayTitle || '').trim() || copy.none;
  const effectiveArtStyleTitle = (artStyleTitle || '').trim() || copy.none;
  const localizedTitle = language === 'ru' ? (TITLE_TRANSLATIONS_RU[title] ?? title) : title;
  const normalizedDescription = (description || '').trim();
  const localizedDescription = language === 'ru'
    ? (DESCRIPTION_TRANSLATIONS_RU[normalizedDescription] ?? description)
    : description;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] data-[state=open]:animate-in data-[state=closed]:animate-out">
        <DialogHeader>
          <DialogTitle>{localizedTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {copy.dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <div className="flex justify-center">
            <div className="relative inline-block">
              <video
                controls
                className="mx-auto h-auto max-w-full rounded-md bg-black max-h-[300px] sm:max-h-[400px]"
                src={videoUrl}
              />
              <div className="pointer-events-none absolute left-2 top-2">
                <Badge className="pointer-events-auto bg-black/70 text-white hover:bg-black/80">
                  {copy.videoPreview}
                </Badge>
              </div>
            </div>
          </div>
          {/* Info row: voice + captions style + overlay + art style */}
          <div className="mt-3 flex flex-wrap items-center gap-2 justify-center text-xs sm:text-sm">
            <Badge variant="default">{copy.voice}: {effectiveVoiceTitle}</Badge>
            <Badge variant="default">{copy.captions}: {effectiveCaptionsTitle}</Badge>
            <Badge variant="default">{copy.overlay}: {effectiveOverlayTitle}</Badge>
            <Badge variant="default">{copy.art}: {effectiveArtStyleTitle}</Badge>
          </div>
        </div>
        {localizedDescription && localizedDescription.trim().length > 0 ? (
          <div className="mt-4">
            <Separator className="mb-3" />
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {localizedDescription}
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          {onUse ? (
            <>
              <button
                type="button"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                onClick={() => onOpenChange(false)}
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                onClick={() => { onUse(); onOpenChange(false); }}
              >
                {copy.useIt}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
              onClick={() => onOpenChange(false)}
            >
              {copy.close}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
