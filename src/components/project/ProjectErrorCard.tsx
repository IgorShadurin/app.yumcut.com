"use client";

import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CONTACT_EMAIL } from '@/shared/constants/app';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

export function ProjectErrorCard({ message }: { message?: string | null }) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    title: string;
    description: string;
    problem: string;
    unknownError: string;
    questions: string;
  }> = {
    en: {
      title: "Something broke - we're on it!",
      description:
        "Your project hit an error on our servers. We're fixing it now. After the fix, your project will automatically resume video generation from where it paused - no action needed.",
      problem: 'Problem',
      unknownError: 'Unknown error',
      questions: 'Questions? Email',
    },
    ru: {
      title: 'Возникла ошибка, уже исправляем',
      description:
        'На нашем сервере произошла ошибка при обработке проекта. Мы уже исправляем проблему. После фикса генерация продолжится автоматически с того же места.',
      problem: 'Проблема',
      unknownError: 'Неизвестная ошибка',
      questions: 'Вопросы? Напишите на',
    },
  };
  const t = copy[language];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4" />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <p className="text-sm leading-6">
            {t.description}
          </p>
          <p className="mt-2 text-sm leading-6">
            {t.problem}: <span className="font-medium">{message || t.unknownError}</span>
          </p>
          <p className="mt-2 text-sm leading-6">
            {t.questions}{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
