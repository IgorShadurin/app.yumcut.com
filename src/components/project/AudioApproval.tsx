"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle, RefreshCw, Mic, Coins } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ProjectStatus } from '@/shared/constants/status';
import { useTokenSummary, requestTokenRefresh } from '@/hooks/useTokenSummary';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { toast } from 'sonner';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { ProjectLanguageVariantDTO } from '@/shared/types';
import { getLanguageFlag } from '@/shared/constants/languages';
import { Api } from '@/lib/api-client';
import { LanguageTabsList } from './LanguageTabsList';
import { formatDateTimeWithSeconds } from '@/lib/date';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type AudioApprovalProps = {
  projectId: string;
  variants: ProjectLanguageVariantDTO[];
  primaryLanguage: string;
};

type AudioApprovalCopy = {
  noCandidatesYet: (langCode: string) => string;
  generatedAt: string;
  approve: string;
  approveSelected: string;
  voiceoverCandidates: string;
  audioApproved: string;
  audioApprovedDescription: string;
  approving: string;
  regenerateAudio: (flaggedLabel: string) => string;
  regenerateTitle: (flaggedLabel: string) => string;
  regenerateDescription: string;
  currentSelection: string;
  tokensUnit: string;
  balanceAfterSpend: (balance: number) => string;
  keepCurrentAudio: (langCode: string) => string;
  notEnoughTokens: string;
  cancel: string;
  regenerateLanguage: (langCode: string) => string;
  audioRegenerationRequested: string;
  audioRegenerationRequestedDescription: (langCode: string) => string;
};

const COPY: Record<AppLanguageCode, AudioApprovalCopy> = {
  en: {
    noCandidatesYet: (langCode) => `No audio candidates for ${langCode} yet.`,
    generatedAt: 'Generated',
    approve: 'Approve',
    approveSelected: 'Approve selected',
    voiceoverCandidates: 'Voiceover candidates',
    audioApproved: 'Audio approved',
    audioApprovedDescription: 'Primary language voiceover approved.',
    approving: 'Approving…',
    regenerateAudio: (flaggedLabel) => `Regenerate ${flaggedLabel} audio`,
    regenerateTitle: (flaggedLabel) => `Regenerate ${flaggedLabel} audio?`,
    regenerateDescription: 'Only the selected language will be regenerated. Existing candidates for other languages stay untouched.',
    currentSelection: 'Current selection',
    tokensUnit: 'tokens',
    balanceAfterSpend: (balance) => `Balance after spend: ${balance}`,
    keepCurrentAudio: (langCode) => `Cancel if you want to keep the current ${langCode} audio. Other languages will not be affected.`,
    notEnoughTokens: 'Not enough tokens to regenerate audio.',
    cancel: 'Cancel',
    regenerateLanguage: (langCode) => `Regenerate ${langCode}`,
    audioRegenerationRequested: 'Audio regeneration requested',
    audioRegenerationRequestedDescription: (langCode) => `${langCode} voiceover will be re-generated shortly.`,
  },
  ru: {
    noCandidatesYet: (langCode) => `Пока нет вариантов озвучки для ${langCode}.`,
    generatedAt: 'Сгенерировано',
    approve: 'Подтвердить',
    approveSelected: 'Подтвердить выбранное',
    voiceoverCandidates: 'Варианты озвучки',
    audioApproved: 'Озвучка подтверждена',
    audioApprovedDescription: 'Озвучка основного языка подтверждена.',
    approving: 'Подтверждаем…',
    regenerateAudio: (flaggedLabel) => `Перегенерировать озвучку ${flaggedLabel}`,
    regenerateTitle: (flaggedLabel) => `Перегенерировать озвучку ${flaggedLabel}?`,
    regenerateDescription: 'Будет перегенерирован только выбранный язык. Варианты других языков не изменятся.',
    currentSelection: 'Текущий выбор',
    tokensUnit: 'токенов',
    balanceAfterSpend: (balance) => `Баланс после списания: ${balance}`,
    keepCurrentAudio: (langCode) => `Нажмите «Отмена», если хотите оставить текущую озвучку ${langCode}. Другие языки не затрагиваются.`,
    notEnoughTokens: 'Недостаточно токенов для перегенерации озвучки.',
    cancel: 'Отмена',
    regenerateLanguage: (langCode) => `Перегенерировать ${langCode}`,
    audioRegenerationRequested: 'Запрос на перегенерацию озвучки отправлен',
    audioRegenerationRequestedDescription: (langCode) => `Озвучка ${langCode} будет перегенерирована в ближайшее время.`,
  },
};

export function AudioApproval({ projectId, variants, primaryLanguage }: AudioApprovalProps) {
  const { language } = useAppLanguage();
  const t = COPY[language];

  const variantsWithAudio = useMemo(() => {
    if (variants.length > 0) return variants;
    return [{ languageCode: primaryLanguage, audioCandidates: [] }];
  }, [variants, primaryLanguage]);

  const manualSelectionRef = useRef<Set<string>>(new Set());

  const [activeLanguage, setActiveLanguage] = useState(variantsWithAudio[0]?.languageCode ?? primaryLanguage);
  const [selectedByLanguage, setSelectedByLanguage] = useState(() => {
    const initial = new Map<string, string | null>();
    variantsWithAudio.forEach((variant) => {
      const preferred = (variant.audioCandidates ?? []).find((candidate) => (candidate as any).isFinal === true)?.id
        ?? variant.audioCandidates?.[0]?.id
        ?? null;
      initial.set(variant.languageCode, preferred);
    });
    return initial;
  });
  const [approving, setApproving] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const { balance: tokenBalance, summary: tokenSummary, loading: tokensLoading } = useTokenSummary();
  const regenCost = tokenSummary?.actionCosts.audioRegeneration ?? TOKEN_COSTS.actions.audioRegeneration;
  const hasTokensForRegen = tokenBalance >= regenCost;

  const missingSelection = variantsWithAudio.some((variant) => {
    const candidates = variant.audioCandidates ?? [];
    if (candidates.length === 0) return true;
    return !selectedByLanguage.get(variant.languageCode);
  });
  const disableApprove = approving || missingSelection;
  const activeVariant = variantsWithAudio.find((variant) => variant.languageCode === activeLanguage);
  const approvalsAvailable = activeVariant?.audioCandidates?.length ?? 0;
  const approveLabel = approvalsAvailable <= 1 ? t.approve : t.approveSelected;
  const activeFlaggedLabel = `${getLanguageFlag(activeLanguage)} ${activeLanguage.toUpperCase()}`;

  useEffect(() => {
    setSelectedByLanguage((prev) => {
      let changed = false;
      const next = new Map(prev);
      variantsWithAudio.forEach((variant) => {
        const languageCode = variant.languageCode;
        const current = next.get(languageCode) ?? null;
        const candidates = variant.audioCandidates ?? [];
        const candidateIds = candidates.map((candidate) => candidate.id);
        const finalCandidate = candidates.find((candidate) => (candidate as any).isFinal)?.id ?? null;
        const hasManualOverride = manualSelectionRef.current.has(languageCode);
        let nextSelection = current;

        if (current && !candidateIds.includes(current)) {
          nextSelection = finalCandidate ?? candidateIds[0] ?? null;
          manualSelectionRef.current.delete(languageCode);
        } else if (!current) {
          nextSelection = finalCandidate ?? candidateIds[0] ?? null;
        } else if (!hasManualOverride && finalCandidate && finalCandidate !== current) {
          nextSelection = finalCandidate;
        }

        if (nextSelection !== current) {
          next.set(languageCode, nextSelection ?? null);
          changed = true;
        }
      });
      for (const key of Array.from(next.keys())) {
        if (!variantsWithAudio.some((variant) => variant.languageCode === key)) {
          next.delete(key);
          manualSelectionRef.current.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [variantsWithAudio]);

  useEffect(() => {
    if (!variantsWithAudio.some((variant) => variant.languageCode === activeLanguage)) {
      setActiveLanguage(variantsWithAudio[0]?.languageCode ?? primaryLanguage);
    }
  }, [variantsWithAudio, activeLanguage, primaryLanguage]);

  const handleSelection = (languageCode: string, audioId: string) => {
    setSelectedByLanguage((prev) => {
      const next = new Map(prev);
      next.set(languageCode, audioId);
      return next;
    });
    manualSelectionRef.current.add(languageCode);
  };

  const renderCandidates = (variant: ProjectLanguageVariantDTO) => {
    const candidates = variant.audioCandidates ?? [];
    const currentSelection = selectedByLanguage.get(variant.languageCode) ?? null;

    if (candidates.length === 0) {
      return (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {t.noCandidatesYet(variant.languageCode.toUpperCase())}
        </div>
      );
    }

    if (candidates.length === 1) {
      const candidate = candidates[0];
      const source = candidate.url ?? candidate.path ?? undefined;
      return (
        <div className="space-y-1">
          <audio controls src={source} className="w-full" preload="none" />
          {candidate.createdAt ? (
            <p className="text-xs text-muted-foreground">
              {t.generatedAt} {formatDateTimeWithSeconds(candidate.createdAt)}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <RadioGroup
        value={currentSelection ?? undefined}
        onValueChange={(value) => handleSelection(variant.languageCode, value)}
        className="space-y-2"
      >
        {candidates.map((candidate) => {
          const source = candidate.url ?? candidate.path;
          return (
            <div
              key={candidate.id}
              className="flex items-start gap-4 sm:gap-5"
              onClick={() => handleSelection(variant.languageCode, candidate.id)}
              role="button"
            >
              <RadioGroupItem value={candidate.id} id={`audio-${variant.languageCode}-${candidate.id}`} />
              <div className="flex-1 min-w-0 space-y-1">
                <audio controls src={source} className="w-full" preload="none" />
                {candidate.createdAt ? (
                  <p className="text-xs text-muted-foreground">
                    {t.generatedAt} {formatDateTimeWithSeconds(candidate.createdAt)}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </RadioGroup>
    );
  };

  const tabItems = useMemo(
    () =>
      variantsWithAudio.map((variant) => ({
        languageCode: variant.languageCode,
        ready: (variant.audioCandidates?.length ?? 0) > 0,
      })),
    [variantsWithAudio],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Mic className="h-4 w-4 text-emerald-500" />
          {t.voiceoverCandidates}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-3">
        {variantsWithAudio.length > 1 ? (
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage}>
            <LanguageTabsList items={tabItems} listClassName="sm:gap-1" />
            {variantsWithAudio.map((variant) => {
              return (
                <TabsContent key={variant.languageCode} value={variant.languageCode} className="mt-4 sm:mt-5">
                  {renderCandidates(variant)}
                </TabsContent>
              );
            })}
          </Tabs>
        ) : (
          (() => {
            const variant = variantsWithAudio[0];
            return (
              <div className="mt-1 sm:mt-2">
                {renderCandidates(variant)}
              </div>
            );
          })()
        )}

        {variantsWithAudio.some((variant) => (variant.audioCandidates?.length ?? 0) > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-5 sm:mt-6 lg:mt-7">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  if (approving || missingSelection) return;
                  try {
                    setApproving(true);
                    const selectionsPayload = Array.from(selectedByLanguage.entries())
                      .filter(([, audioId]) => !!audioId)
                      .map(([languageCode, audioId]) => ({
                        languageCode,
                        audioId: audioId as string,
                      }));
                    await Api.approveAudio(projectId, selectionsPayload);
                    manualSelectionRef.current.clear();
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('project:updated', { detail: { id: projectId, status: ProjectStatus.ProcessImagesGeneration } })
                      );
                    }
                    requestTokenRefresh();
                    toast.success(t.audioApproved, { description: t.audioApprovedDescription });
                  } finally {
                    setApproving(false);
                  }
                }}
                disabled={disableApprove}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {approving ? t.approving : approveLabel}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRegenOpen(true)}
                disabled={!tokensLoading && !hasTokensForRegen}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t.regenerateAudio(activeFlaggedLabel)}
              </Button>
            </div>
          </div>
        )}
        <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.regenerateTitle(activeFlaggedLabel)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <DialogDescription>
                {t.regenerateDescription}
              </DialogDescription>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t.currentSelection}: <span className="font-medium">{activeFlaggedLabel}</span>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-amber-600 dark:bg-amber-950/60">
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">{regenCost} {t.tokensUnit}</div>
                  <div className="text-xs text-amber-700/80 dark:text-amber-200/80">{t.balanceAfterSpend(Math.max(tokenBalance - regenCost, 0))}</div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t.keepCurrentAudio(activeLanguage.toUpperCase())}
              </p>
            </div>
            {(!tokensLoading && !hasTokensForRegen) && (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 text-xs">
                {t.notEnoughTokens}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" size="sm">{t.cancel}</Button>
              </DialogClose>
              <Button
                variant="outline"
                className="border-red-500 text-red-600 hover:bg-red-50 dark:border-red-400 dark:text-red-300 dark:hover:bg-red-950/40"
                size="sm"
                disabled={!hasTokensForRegen}
                onClick={async () => {
                  try {
                    await Api.regenerateAudios(projectId, activeLanguage);
                    requestTokenRefresh();
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('project:updated', {
                        detail: { id: projectId, status: ProjectStatus.ProcessAudio },
                      }));
                    }
                    toast.success(t.audioRegenerationRequested, {
                      description: t.audioRegenerationRequestedDescription(activeLanguage.toUpperCase()),
                    });
                  } finally {
                    setRegenOpen(false);
                  }
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t.regenerateLanguage(activeLanguage.toUpperCase())}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

