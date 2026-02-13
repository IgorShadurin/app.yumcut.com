import { Button } from '@/components/ui/button';
import { Card as UICard, CardContent as UICardContent } from '@/components/ui/card';
import type { PendingProjectDraft } from '@/shared/types';
import { Play } from 'lucide-react';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type TemplateSectionProps = {
  template: PendingProjectDraft['template'] | null | undefined;
  onPreview: () => void;
};

type TemplateSectionCopy = {
  title: string;
  previewSuffix: string;
  previewAria: string;
  defaultTemplate: string;
};

const COPY: Record<AppLanguageCode, TemplateSectionCopy> = {
  en: {
    title: 'Template',
    previewSuffix: 'preview',
    previewAria: 'Preview template video',
    defaultTemplate: 'Default template',
  },
  ru: {
    title: 'Шаблон',
    previewSuffix: 'превью',
    previewAria: 'Открыть предпросмотр шаблона',
    defaultTemplate: 'Шаблон по умолчанию',
  },
};

export function TemplateSection({ template, onPreview }: TemplateSectionProps) {
  const { language } = useAppLanguage();
  const copy = COPY[language];

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{copy.title}</h2>
      {template ? (
        <div className="grid grid-cols-1">
          <UICard>
            <UICardContent className="p-3">
              <div className="relative mx-auto">
                <div className="relative mx-auto h-[300px] aspect-[9/16] overflow-hidden rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={template.previewImageUrl}
                    alt={`${template.title} ${copy.previewSuffix}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 cursor-pointer rounded-full"
                  onClick={onPreview}
                  aria-label={copy.previewAria}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={template.title}>
                  {template.title}
                </div>
              </div>
            </UICardContent>
          </UICard>
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
          {copy.defaultTemplate}
        </div>
      )}
    </section>
  );
}
