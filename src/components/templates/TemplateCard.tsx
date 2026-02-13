"use client";
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/common/Tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Play } from 'lucide-react';
import type { TemplateCustomData } from '@/shared/templates/custom-data';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

export interface TemplateListItem {
  id: string;
  title: string;
  description?: string | null;
  previewImageUrl: string;
  previewVideoUrl: string;
  weight?: number | null;
  createdAt?: string;
  updatedAt?: string;
  customData?: TemplateCustomData | null;
  captionsStyle?: {
    id: string;
    title: string;
  } | null;
  overlay?: {
    id: string;
    title: string;
  } | null;
  artStyle?: {
    id: string;
    title: string;
  } | null;
  voice?: {
    id: string;
    title: string;
    description: string | null;
    externalId: string | null;
    previewPath: string | null;
  } | null;
}

const COPY: Record<AppLanguageCode, { newBadge: string; noDescription: string }> = {
  en: {
    newBadge: 'New!',
    noDescription: 'No description',
  },
  ru: {
    newBadge: 'Новый',
    noDescription: 'Нет описания',
  },
};

export function TemplateCard({
  item,
  selected,
  onSelect,
  onPreview,
}: {
  item: TemplateListItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
}) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const isCustomTemplate = item.customData?.type === 'custom';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
      className={cn(
        'group focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        'data-[state=selected]:ring-1 data-[state=selected]:ring-blue-500 rounded-lg'
      )}
      data-state={selected ? 'selected' : 'idle'}
      aria-pressed={selected}
    >
      <Card
        className={cn(
          'relative overflow-hidden p-0 border transition-colors rounded-lg',
          selected ? 'border-blue-300 dark:border-blue-600' : 'hover:border-gray-300 dark:hover:border-gray-700'
        )}
      >
        <Tooltip content={item.description || copy.noDescription}>
          <div className="relative w-full">
            {isCustomTemplate && (
              <Badge
                variant="info"
                className="pointer-events-none absolute left-2 top-2 z-10 bg-blue-600/95 text-white shadow-sm dark:bg-blue-500/95"
              >
                {copy.newBadge}
              </Badge>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewImageUrl}
              alt={`${item.title} preview`}
              className="w-full h-auto max-h-[300px] object-cover"
              loading="lazy"
            />

            {/* Bottom gradient overlay for title + preview icon */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="pointer-events-auto h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/70 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onPreview(item.id); }}
                aria-label={`Preview ${item.title}`}
              >
                <Play className="h-4 w-4" />
              </Button>
              <div className="pointer-events-none truncate text-sm font-semibold text-white" title={item.title}>{item.title}</div>
            </div>
          </div>
        </Tooltip>
      </Card>
    </div>
  );
}
