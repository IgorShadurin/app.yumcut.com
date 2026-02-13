"use client";
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Download } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { ProjectLanguageVariantDTO } from '@/shared/types';
import { Tooltip } from '@/components/common/Tooltip';
import { LanguageTabsList } from './LanguageTabsList';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type ProjectApprovedAudioCardProps = {
  variants: ProjectLanguageVariantDTO[];
  primaryLanguage: string;
  fallbackUrl?: string | null;
  title?: string | null;
};

export function ProjectApprovedAudioCard({ variants, primaryLanguage, fallbackUrl, title }: ProjectApprovedAudioCardProps) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    title: string;
    downloadVoiceover: (langCode: string) => string;
    processingTooltip: string;
    downloadAria: string;
    processingAria: string;
    processingText: (langCode: string) => string;
    voiceoverFallbackTitle: string;
  }> = {
    en: {
      title: 'Voiceover',
      downloadVoiceover: (langCode) => `Download voiceover (${langCode})`,
      processingTooltip: 'Voiceover is still processing for this language',
      downloadAria: 'Download voiceover',
      processingAria: 'Voiceover still processing',
      processingText: (langCode) => `Voiceover is still being processed for ${langCode}. Check back soon.`,
      voiceoverFallbackTitle: 'voiceover',
    },
    ru: {
      title: 'Озвучка',
      downloadVoiceover: (langCode) => `Скачать озвучку (${langCode})`,
      processingTooltip: 'Озвучка для этого языка ещё обрабатывается',
      downloadAria: 'Скачать озвучку',
      processingAria: 'Озвучка ещё обрабатывается',
      processingText: (langCode) => `Озвучка для ${langCode} ещё готовится. Попробуйте чуть позже.`,
      voiceoverFallbackTitle: 'ozvuchka',
    },
  };
  const t = copy[language];

  const audioVariants = useMemo(() => {
    if (variants.length === 0) {
      const resolved = fallbackUrl ?? null;
      return [{
        languageCode: primaryLanguage,
        url: resolved,
        isReady: Boolean(resolved),
      }];
    }
    return variants.map((variant) => {
      const rawUrl = variant.finalVoiceoverUrl || variant.finalVoiceoverPath || null;
      const resolved =
        rawUrl
        ?? (variant.languageCode === primaryLanguage && fallbackUrl ? fallbackUrl : null);
      return {
        languageCode: variant.languageCode,
        url: resolved,
        isReady: Boolean(resolved),
      };
    });
  }, [variants, fallbackUrl, primaryLanguage]);

  const [activeLanguage, setActiveLanguage] = useState(() => (
    audioVariants.find((entry) => entry.languageCode === primaryLanguage)?.languageCode
      ?? audioVariants[0]?.languageCode
      ?? primaryLanguage
  ));

  useEffect(() => {
    if (!audioVariants.some((entry) => entry.languageCode === activeLanguage)) {
      const fallback = audioVariants.find((entry) => entry.languageCode === primaryLanguage)
        ?? audioVariants[0]
        ?? null;
      if (fallback) {
        setActiveLanguage(fallback.languageCode);
      }
    }
  }, [audioVariants, activeLanguage, primaryLanguage]);

  const activeEntry = audioVariants.find((entry) => entry.languageCode === activeLanguage) ?? audioVariants[0];
  const url = activeEntry?.url ?? null;
  const isDownloadReady = Boolean(url);
  const safeTitle = (title || t.voiceoverFallbackTitle)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'voiceover';
  const downloadName = `${safeTitle}-${activeLanguage}.mp3`;

  const renderAudioBody = (entry: { languageCode: string; url: string | null; isReady: boolean }) => {
    if (entry.isReady && entry.url) {
      return <audio controls className="w-full" src={entry.url} />;
    }
    return (
      <p className="text-sm text-muted-foreground italic">
        {t.processingText(entry.languageCode.toUpperCase())}
      </p>
    );
  };

  const tabItems = useMemo(
    () =>
      audioVariants.map((entry) => ({
        languageCode: entry.languageCode,
        ready: entry.isReady,
      })),
    [audioVariants],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mic className="h-4 w-4 text-emerald-500" />
          {t.title}
        </CardTitle>
        <Tooltip content={isDownloadReady ? t.downloadVoiceover(activeLanguage.toUpperCase()) : t.processingTooltip}>
          {isDownloadReady ? (
            <Button asChild variant="outline" size="icon">
              <a href={url ?? undefined} download={downloadName} aria-label={t.downloadAria}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="icon" disabled aria-label={t.processingAria}>
              <Download className="h-4 w-4" />
            </Button>
          )}
        </Tooltip>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-3">
        {audioVariants.length > 1 ? (
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage}>
            <LanguageTabsList items={tabItems} />
            {audioVariants.map((entry) => (
              <TabsContent key={entry.languageCode} value={entry.languageCode} className="mt-3">
                {renderAudioBody(entry)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          renderAudioBody(audioVariants[0])
        )}
      </CardContent>
    </Card>
  );
}
