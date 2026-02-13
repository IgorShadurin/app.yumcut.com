"use client";

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip } from '@/components/common/Tooltip';
import { Download, FileText, MessageSquare } from 'lucide-react';
import * as React from 'react';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

export function ProjectPromptCard({
  prompt,
  rawScript,
  settings,
}: {
  prompt?: string | null;
  rawScript?: string | null;
  settings?: React.ReactNode;
}) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    yourPrompt: string;
    inputTextScript: string;
    promptFileName: string;
    scriptFileName: string;
    downloadPrompt: string;
    downloadScript: string;
  }> = {
    en: {
      yourPrompt: 'Your Prompt',
      inputTextScript: 'Input Text Script',
      promptFileName: 'prompt.txt',
      scriptFileName: 'input-text-script.txt',
      downloadPrompt: 'Download prompt',
      downloadScript: 'Download input text script',
    },
    ru: {
      yourPrompt: 'Ваш запрос',
      inputTextScript: 'Исходный текст сценария',
      promptFileName: 'zapros.txt',
      scriptFileName: 'ishodnyj-scenarij.txt',
      downloadPrompt: 'Скачать запрос',
      downloadScript: 'Скачать исходный текст сценария',
    },
  };
  const t = copy[language];

  const trimmedPrompt = prompt?.trim() ?? '';
  const trimmedRawScript = rawScript?.trim() ?? '';
  const showPrompt = trimmedPrompt.length > 0;
  const text = showPrompt ? trimmedPrompt : trimmedRawScript;
  const label = showPrompt ? t.yourPrompt : t.inputTextScript;
  const dataHref = text ? `data:text/plain;charset=utf-8,${encodeURIComponent(text)}` : null;
  const downloadName = showPrompt ? t.promptFileName : t.scriptFileName;
  if (!text) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {label === t.inputTextScript ? (
            <FileText className="h-4 w-4 text-violet-500" />
          ) : (
            <MessageSquare className="h-4 w-4 text-sky-500" />
          )}
          {label}
        </CardTitle>
        <Tooltip content={showPrompt ? t.downloadPrompt : t.downloadScript}>
          <Button asChild variant="outline" size="icon" aria-label={showPrompt ? t.downloadPrompt : t.downloadScript}>
            <a href={dataHref ?? undefined} download={downloadName}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </Tooltip>
      </CardHeader>
      <CardContent>
        <div className="text-sm leading-6 whitespace-pre-wrap text-gray-800 dark:text-gray-200">
          {text}
        </div>
        {settings ? (
          <>
            <hr className="my-4 border-t border-gray-200 dark:border-gray-800" />
            <div>{settings}</div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
