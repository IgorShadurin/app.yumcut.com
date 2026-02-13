"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Api } from '@/lib/api-client';
import { TemplateCard, type TemplateListItem } from './TemplateCard';
import { TemplatePreviewDialog } from './TemplatePreviewDialog';
import { useSettings } from '@/hooks/useSettings';
import type { TemplateCustomData } from '@/shared/templates/custom-data';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

export type TemplateSelection =
  { type: 'custom'; id: string; title: string; description?: string | null; previewImageUrl: string; previewVideoUrl: string; weight?: number | null; voiceId?: string | null; voiceExternalId?: string | null; voiceTitle?: string | null; voicePreviewPath?: string | null; customData?: TemplateCustomData | null };

const COPY: Record<AppLanguageCode, { sectionTitle: string }> = {
  en: { sectionTitle: 'Video Templates' },
  ru: { sectionTitle: 'Видео-шаблоны' },
};

export function TemplatePicker({
  onChange,
}: {
  onChange?: (selection: TemplateSelection | null) => void;
}) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const { settings, update } = useSettings();
  const [items, setItems] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ open: boolean; item: TemplateListItem | null }>({ open: false, item: null });

  useEffect(() => {
    let mounted = true;
    Api.listTemplates()
      .then((list) => {
        if (!mounted) return;
        setItems(list as TemplateListItem[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { mounted = false; };
  }, []);

  const gridItems = useMemo(() => items, [items]);

  useEffect(() => {
    if (!selectedId) return;
    const exists = items.some((item) => item.id === selectedId);
    if (!exists) {
      setSelectedId(null);
      onChange?.(null);
    }
  }, [items, onChange, selectedId]);

  // On load, prefer user's saved template; otherwise fall back to first item
  useEffect(() => {
    if (loading) return;
    if (items.length === 0) return;
    if (selectedId) return;
    const preferred = settings?.preferredTemplateId || null;
    const pick = preferred && items.some((i) => i.id === preferred)
      ? items.find((i) => i.id === preferred)!
      : items[0];
    setSelectedId(pick.id);
    onChange?.({
      type: 'custom',
      id: pick.id,
      title: pick.title,
      description: pick.description,
      previewImageUrl: pick.previewImageUrl,
      previewVideoUrl: pick.previewVideoUrl,
      weight: pick.weight,
      voiceId: pick.voice?.id ?? null,
      voiceExternalId: pick.voice?.externalId ?? null,
      voiceTitle: pick.voice?.title ?? null,
      voicePreviewPath: pick.voice?.previewPath ?? null,
      customData: pick.customData ?? null,
    });
  }, [items, loading, onChange, selectedId, settings?.preferredTemplateId]);

  const handleSelect = useCallback((id: string, options?: { allowToggle?: boolean }) => {
    const toggledOff = options?.allowToggle === true && selectedId === id;
    if (toggledOff) {
      setSelectedId(null);
      onChange?.(null);
      return;
    }
    const item = items.find((it) => it.id === id);
    if (!item) return;
    setSelectedId(id);
    // Persist preferred template in settings
    update('preferredTemplateId' as any, id as any).catch(() => {});
    onChange?.({
      type: 'custom',
      id: item.id,
      title: item.title,
      description: item.description,
      previewImageUrl: item.previewImageUrl,
      previewVideoUrl: item.previewVideoUrl,
      weight: item.weight,
      voiceId: item.voice?.id ?? null,
      voiceExternalId: item.voice?.externalId ?? null,
      voiceTitle: item.voice?.title ?? null,
      voicePreviewPath: item.voice?.previewPath ?? null,
      customData: item.customData ?? null,
    });
  }, [items, onChange, selectedId, update]);

  function SkeletonCard() {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="relative w-full">
          <div className="skeleton aspect-[9/16] w-full max-h-[300px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pb-16 sm:pb-0">
      <div className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">{copy.sectionTitle}</div>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {gridItems.map((it) => (
            <TemplateCard
              key={it.id}
              item={it}
              selected={selectedId === it.id}
              onSelect={handleSelect}
              onPreview={(id) => {
                const item = items.find((x) => x.id === id) || null;
                if (item) setPreview({ open: true, item });
              }}
            />
          ))}
        </div>
      )}

      <TemplatePreviewDialog
        open={preview.open}
        onOpenChange={(v) => setPreview((p) => ({ ...p, open: v }))}
        title={preview.item?.title || ''}
        videoUrl={preview.item?.previewVideoUrl || ''}
        description={preview.item?.description || ''}
        voiceTitle={preview.item?.voice?.title || null}
        captionsTitle={preview.item?.captionsStyle?.title || null}
        overlayTitle={preview.item?.overlay?.title || null}
        artStyleTitle={preview.item?.artStyle?.title || null}
        onUse={preview.item ? () => {
          const item = preview.item!;
          handleSelect(item.id, { allowToggle: false });
        } : undefined}
      />
    </div>
  );
}
