"use client";
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Pencil, Save, X } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { ProjectLanguageVariantDTO } from '@/shared/types';
import { Tooltip } from '@/components/common/Tooltip';
import { LanguageTabsList } from './LanguageTabsList';
import { Textarea } from '@/components/ui/textarea';
import { Api } from '@/lib/api-client';
import { LIMITS } from '@/shared/constants/limits';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type ProjectApprovedScriptCardProps = {
  variants: ProjectLanguageVariantDTO[];
  primaryLanguage: string;
  fallbackText?: string | null;
  title?: string | null;
  projectId?: string;
  canEdit?: boolean;
};

export function ProjectApprovedScriptCard({
  variants,
  primaryLanguage,
  fallbackText,
  title,
  projectId,
  canEdit = false,
}: ProjectApprovedScriptCardProps) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    finalTextScript: string;
    scriptProcessingText: (langCode: string) => string;
    cancel: string;
    save: string;
    saving: string;
    edit: string;
    downloadFinalScript: (langCode: string) => string;
    processingTooltip: string;
    downloadAria: string;
    processingAria: string;
    scriptLengthValidation: (max: number) => string;
    finalScriptFallbackTitle: string;
  }> = {
    en: {
      finalTextScript: 'Final Text Script',
      scriptProcessingText: (langCode) => `Script is still being generated for ${langCode}. Check back soon.`,
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      edit: 'Edit',
      downloadFinalScript: (langCode) => `Download final text script (${langCode})`,
      processingTooltip: 'Final text script is still processing for this language',
      downloadAria: 'Download final text script',
      processingAria: 'Final text script still processing',
      scriptLengthValidation: (max) => `Script must be between 1 and ${max} characters.`,
      finalScriptFallbackTitle: 'final-script',
    },
    ru: {
      finalTextScript: 'Финальный текст сценария',
      scriptProcessingText: (langCode) => `Сценарий для ${langCode} ещё генерируется. Попробуйте позже.`,
      cancel: 'Отмена',
      save: 'Сохранить',
      saving: 'Сохраняем…',
      edit: 'Редактировать',
      downloadFinalScript: (langCode) => `Скачать финальный сценарий (${langCode})`,
      processingTooltip: 'Финальный сценарий для этого языка ещё обрабатывается',
      downloadAria: 'Скачать финальный сценарий',
      processingAria: 'Финальный сценарий ещё обрабатывается',
      scriptLengthValidation: (max) => `Сценарий должен быть от 1 до ${max} символов.`,
      finalScriptFallbackTitle: 'finalnyj-scenarij',
    },
  };
  const t = copy[language];

  const scriptVariants = useMemo(() => {
    if (variants.length === 0) {
      return [{
        languageCode: primaryLanguage,
        scriptText: fallbackText?.trim()?.length ? fallbackText : null,
      }];
    }

    return variants.map((variant) => {
      const trimmed = variant.scriptText?.trim();
      const isPrimary = variant.languageCode === primaryLanguage;
      const resolvedText =
        (trimmed && trimmed.length > 0)
          ? variant.scriptText
          : (isPrimary && fallbackText?.trim()?.length ? fallbackText : null);

      return {
        languageCode: variant.languageCode,
        scriptText: resolvedText,
      };
    });
  }, [variants, primaryLanguage, fallbackText]);

  const [localVariants, setLocalVariants] = useState(scriptVariants);
  useEffect(() => {
    setLocalVariants(scriptVariants);
  }, [scriptVariants]);

  const [activeLanguage, setActiveLanguage] = useState(() => (
    scriptVariants.find((variant) => variant.languageCode === primaryLanguage)?.languageCode
      ?? scriptVariants[0]?.languageCode
      ?? primaryLanguage
  ));

  useEffect(() => {
    if (!scriptVariants.some((variant) => variant.languageCode === activeLanguage)) {
      const fallback = scriptVariants.find((variant) => variant.languageCode === primaryLanguage)
        ?? scriptVariants[0]
        ?? null;
      if (fallback) {
        setActiveLanguage(fallback.languageCode);
      }
    }
  }, [scriptVariants, activeLanguage, primaryLanguage]);

  const activeVariant = localVariants.find((variant) => variant.languageCode === activeLanguage) ?? localVariants[0];
  const text = activeVariant?.scriptText ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(text);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) setDraftText(text);
  }, [text, isEditing]);

  const trimmedDraft = draftText.trim();
  const isDraftValid = trimmedDraft.length > 0 && trimmedDraft.length <= LIMITS.rawScriptMax;
  const canSave = isDraftValid && !isSaving && Boolean(projectId);
  const isDownloadReady = text.trim().length > 0;
  const dataHref = isDownloadReady ? `data:text/plain;charset=utf-8,${encodeURIComponent(text)}` : null;
  const safeTitle = (title || t.finalScriptFallbackTitle)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'final-script';
  const downloadName = `${safeTitle}-${activeLanguage}.txt`;

  const renderScriptBody = (variant: { languageCode: string; scriptText: string | null | undefined }) => {
    if (variant.scriptText && variant.scriptText.trim().length > 0) {
      return (
        <div className="text-sm leading-6 whitespace-pre-wrap text-gray-800 dark:text-gray-200">
          {variant.scriptText}
        </div>
      );
    }
    return (
      <p className="text-sm text-muted-foreground italic">
        {t.scriptProcessingText(variant.languageCode.toUpperCase())}
      </p>
    );
  };

  const tabItems = useMemo(
    () =>
      localVariants.map((variant) => ({
        languageCode: variant.languageCode,
        ready: Boolean(variant.scriptText && variant.scriptText.trim().length > 0),
      })),
    [localVariants],
  );

  const renderEditActions = () => {
    if (!canEdit) return null;
    if (isEditing) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={() => {
              setIsEditing(false);
              setDraftText(text);
            }}
          >
            <X className="mr-2 h-4 w-4" />
            {t.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={async () => {
              if (!projectId) return;
              setIsSaving(true);
              try {
                const result = await Api.updateFinalScript(projectId, {
                  text: draftText,
                  languageCode: activeLanguage,
                });
                setLocalVariants((prev) =>
                  prev.map((entry) =>
                    entry.languageCode === activeLanguage
                      ? { ...entry, scriptText: result.text }
                      : entry,
                  ),
                );
                setIsEditing(false);
              } finally {
                setIsSaving(false);
              }
            }}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? t.saving : t.save}
          </Button>
        </div>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canEdit}
        onClick={() => setIsEditing(true)}
      >
        <Pencil className="mr-2 h-4 w-4" />
        {t.edit}
      </Button>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet-500" />
          {t.finalTextScript}
        </CardTitle>
        <div className="flex items-center gap-2">
          {canEdit ? renderEditActions() : null}
          <Tooltip content={isDownloadReady ? t.downloadFinalScript(activeLanguage.toUpperCase()) : t.processingTooltip}>
            {isDownloadReady ? (
              <Button asChild variant="outline" size="icon">
                <a href={dataHref ?? undefined} download={downloadName} aria-label={t.downloadAria}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="icon" disabled aria-label={t.processingAria}>
                <Download className="h-4 w-4" />
              </Button>
            )}
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {localVariants.length > 1 ? (
          <Tabs
            value={activeLanguage}
            onValueChange={(next) => {
              if (!isEditing) setActiveLanguage(next);
            }}
          >
            <div className={isEditing ? 'pointer-events-none opacity-70' : undefined}>
              <LanguageTabsList items={tabItems} />
            </div>
            {localVariants.map((variant) => (
              <TabsContent key={variant.languageCode} value={variant.languageCode} className="mt-3">
                {variant.languageCode === activeLanguage && isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      rows={18}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {draftText.length}/{LIMITS.rawScriptMax}
                      </span>
                      {!isDraftValid ? (
                        <span className="text-rose-600 dark:text-rose-300">
                          {t.scriptLengthValidation(LIMITS.rawScriptMax)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  renderScriptBody(variant)
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={18}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {draftText.length}/{LIMITS.rawScriptMax}
                </span>
                {!isDraftValid ? (
                  <span className="text-rose-600 dark:text-rose-300">
                    {t.scriptLengthValidation(LIMITS.rawScriptMax)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            renderScriptBody(localVariants[0])
          )
        )}
      </CardContent>
    </Card>
  );
}
