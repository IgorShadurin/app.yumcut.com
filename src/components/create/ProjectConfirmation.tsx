"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wand2 } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { deleteProjectDraft, loadProjectDraft } from '@/lib/project-draft';
import { requestTokenRefresh, useTokenSummary } from '@/hooks/useTokenSummary';
import type { PendingProjectDraft } from '@/shared/types';
import { useVoices } from '@/hooks/useVoices';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TemplatePreviewDialog } from '@/components/templates/TemplatePreviewDialog';
import { SummaryGrid } from './project-confirmation/summary-grid';
import { GuidancePrompts } from './project-confirmation/guidance-prompts';
import { ScriptPreview } from './project-confirmation/script-preview';
import { TemplateSection } from './project-confirmation/template-section';
import { buildProjectOverview } from './project-confirmation/overview';
import { extractExplicitLanguageVoices } from '@/shared/voices/language-voice-map';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type ProjectConfirmationProps = {
  draftId: string;
};

type ProjectConfirmationCopy = {
  loadingAria: string;
  customVoice: string;
  autoVoice: string;
  defaultVoice: string;
  draftNotFoundTitle: string;
  draftNotFoundDescription: string;
  startNewProject: string;
  makeGroupTitle: string;
  makeVideoTitle: string;
  reviewGroupDescription: string;
  reviewVideoDescription: string;
  settingsTitle: string;
  backToMainPage: string;
  createGroup: string;
  createVideo: string;
};

const COPY: Record<AppLanguageCode, ProjectConfirmationCopy> = {
  en: {
    loadingAria: 'Loading',
    customVoice: 'Custom voice',
    autoVoice: 'Auto voice',
    defaultVoice: 'Default voice',
    draftNotFoundTitle: 'Draft not found',
    draftNotFoundDescription: 'Start a new project to generate a confirmation summary.',
    startNewProject: 'Start a new project',
    makeGroupTitle: 'Make this group?',
    makeVideoTitle: 'Make this video?',
    reviewGroupDescription: 'Review the summary, then create your group.',
    reviewVideoDescription: 'Review the summary, then create your video.',
    settingsTitle: 'Settings',
    backToMainPage: 'Back to main page',
    createGroup: 'Create group',
    createVideo: 'Create video',
  },
  ru: {
    loadingAria: 'Загрузка',
    customVoice: 'Свой голос',
    autoVoice: 'Автоголос',
    defaultVoice: 'Голос по умолчанию',
    draftNotFoundTitle: 'Черновик не найден',
    draftNotFoundDescription: 'Запустите новый проект, чтобы увидеть страницу подтверждения.',
    startNewProject: 'Запустить новый проект',
    makeGroupTitle: 'Создать эту группу?',
    makeVideoTitle: 'Создать видео с этими настройками?',
    reviewGroupDescription: 'Проверьте черновик и создайте группу.',
    reviewVideoDescription: 'Проверьте черновик и создайте видео.',
    settingsTitle: 'Настройки',
    backToMainPage: 'На главную',
    createGroup: 'Создать группу',
    createVideo: 'Создать видео',
  },
};

export function ProjectConfirmation({ draftId }: ProjectConfirmationProps) {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const router = useRouter();
  const { setSummary } = useTokenSummary();
  const [draft, setDraft] = useState<PendingProjectDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { getByExternalId, defaultVoiceId } = useVoices();

  useEffect(() => {
    const loaded = loadProjectDraft(draftId);
    setDraft(loaded);
    setLoadingDraft(false);
  }, [draftId]);

  const voiceOption = useMemo(() => getByExternalId(draft?.voiceId ?? defaultVoiceId), [draft?.voiceId, defaultVoiceId, getByExternalId]);

  const languageVoiceSelections = useMemo(() => {
    if (!draft) return {} as Record<string, { voiceId: string | null; label: string }>;
    const codes = draft.languageCodes ?? (draft.languageCode ? [draft.languageCode] : []);
    const voiceMap = (draft.languageVoices ?? {}) as Record<string, string | null>;
    const map: Record<string, { voiceId: string | null; label: string }> = {};
    codes.forEach((code) => {
      const voiceId = voiceMap[code] ?? null;
      if (voiceId) {
        const option = getByExternalId(voiceId);
        map[code] = { voiceId, label: option?.title ?? copy.customVoice };
      } else {
        map[code] = { voiceId: null, label: copy.autoVoice };
      }
    });
    return map;
  }, [copy.autoVoice, copy.customVoice, draft, getByExternalId]);

  const overview = useMemo(() => {
    if (!draft) return null;
    return buildProjectOverview({
      draft,
      voiceOption,
      defaultVoiceName: voiceOption?.title ?? copy.defaultVoice,
      languageVoiceSelections,
      appLanguage: language,
    });
  }, [copy.defaultVoice, draft, language, languageVoiceSelections, voiceOption]);

  async function handleCreate() {
    if (!draft || submitting) return;
    if (!draft.groupMode && !draft.hasEnoughTokens) {
      router.push('/tokens');
      return;
    }
    setSubmitting(true);
    const sanitizedLanguageVoices = extractExplicitLanguageVoices(draft.payload.languageVoices ?? null);
    const payloadForApi = {
      ...draft.payload,
      languageVoices: Object.keys(sanitizedLanguageVoices).length > 0 ? sanitizedLanguageVoices : undefined,
    };

    try {
      if (draft.groupMode) {
        await Api.createGroup({
          prompt: draft.useExact ? undefined : draft.payload.prompt,
          rawScript: draft.useExact ? draft.text : undefined,
          durationSeconds: draft.durationSeconds ?? draft.effectiveDurationSeconds,
          useExactTextAsScript: !!draft.useExact,
          characterSelection: draft.payload.characterSelection || undefined,
          settings: draft.settings,
          voiceId: draft.voiceId || undefined,
          languageCode: draft.languageCode,
        });
        deleteProjectDraft(draft.id);
        router.replace('/');
      } else {
        const res = await Api.createProject(payloadForApi);
        setSummary?.((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            balance: Math.max(prev.balance - draft.tokenCost, 0),
          };
        });
        Api.getTokenSummary()
          .then((data) => setSummary?.(data))
          .catch(() => {});
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('project:created', { detail: res }));
        }
        requestTokenRefresh();
        deleteProjectDraft(draft.id);
        router.replace(`/project/${res.id}`);
      }
    } catch (error) {
      setSubmitting(false);
    }
  }

  function handleBack() {
    router.push('/');
  }

  if (loadingDraft) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-label={copy.loadingAria} />
      </div>
    );
  }

  if (!draft || !overview) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{copy.draftNotFoundTitle}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{copy.draftNotFoundDescription}</p>
        <Button onClick={() => router.push('/')}>{copy.startNewProject}</Button>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-10 pt-6 sm:px-0">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {draft.groupMode ? copy.makeGroupTitle : copy.makeVideoTitle}
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {draft.groupMode ? copy.reviewGroupDescription : copy.reviewVideoDescription}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <ScriptPreview label={overview.scriptLabel} characterCount={overview.scriptCharCount} text={overview.scriptText} />

            <GuidancePrompts sections={overview.guidanceSections} />

            <section className="space-y-2">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{copy.settingsTitle}</h2>
              <SummaryGrid items={overview.summaryItems} />
            </section>

            <TemplateSection
              template={draft.template ?? null}
              onPreview={() => setPreviewOpen(true)}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 py-3 text-base"
            onClick={handleBack}
            disabled={submitting}
          >
            {copy.backToMainPage}
          </Button>
          <Button
            size="lg"
            className="flex-1 py-3 text-base"
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <Wand2 className="h-4 w-4" />
                {draft.groupMode ? copy.createGroup : copy.createVideo}
              </span>
            )}
          </Button>
        </div>
      </div>

      <TemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={draft.template?.title || ''}
        videoUrl={draft.template?.previewVideoUrl || ''}
        description={draft.template?.description || ''}
      />
    </>
  );
}
