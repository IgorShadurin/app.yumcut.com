"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Api } from '@/lib/api-client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, FileCheck2, Send, Coins } from 'lucide-react';
import { toast } from 'sonner';
import { ProjectStatus } from '@/shared/constants/status';
import { LIMITS } from '@/shared/constants/limits';
import { useTokenSummary, requestTokenRefresh } from '@/hooks/useTokenSummary';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip } from '@/components/common/Tooltip';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { ProjectLanguageVariantDTO } from '@/shared/types';
import { LanguageTabsList } from './LanguageTabsList';
import { getLanguageFlag } from '@/shared/constants/languages';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type ScriptEditorProps = {
  projectId: string;
  variants: ProjectLanguageVariantDTO[];
  primaryLanguage: string;
  fallbackText?: string | null;
};

type ScriptEditorCopy = {
  minCharacters: (min: number) => string;
  refinementRequested: string;
  refinementRequestedDescription: string;
  translateRefinedTooltip: string;
  translateRefinedLabel: string;
  refinePlaceholder: string;
  notEnoughTokensToRefine: (need: number, have: number) => string;
  sending: string;
  send: string;
  scriptApproved: string;
  scriptApprovedDescription: string;
  approving: string;
  approveScripts: string;
  approveScript: string;
  tokensDialogTitle: string;
  tokensDialogDescription: string;
  languageLabel: string;
  tokensUnit: string;
  balanceAfterSpend: (value: number) => string;
  cancelText: string;
  cancelHint: string;
  spending: string;
  spendTokens: (value: number) => string;
  scriptLengthValidation: (max: number) => string;
};

const COPY: Record<AppLanguageCode, ScriptEditorCopy> = {
  en: {
    minCharacters: (min) => `Min ${min} characters`,
    refinementRequested: 'Refinement requested',
    refinementRequestedDescription: 'We will notify you when the updated script is ready.',
    translateRefinedTooltip: 'Refined text overwrites scripts in all other project languages.',
    translateRefinedLabel: 'Translate refined script',
    refinePlaceholder: 'Ask AI to refine',
    notEnoughTokensToRefine: (need, have) => `Not enough tokens to refine. Need ${need}, have ${have}.`,
    sending: 'Sending…',
    send: 'Send',
    scriptApproved: 'Script approved',
    scriptApprovedDescription: 'Voiceover generation will begin shortly.',
    approving: 'Approving…',
    approveScripts: 'Approve Scripts',
    approveScript: 'Approve Script',
    tokensDialogTitle: 'Use tokens to refine the script?',
    tokensDialogDescription: 'Regenerating the script will deduct tokens immediately.',
    languageLabel: 'Language',
    tokensUnit: 'tokens',
    balanceAfterSpend: (value) => `Balance after spend: ${value}`,
    cancelText: 'Cancel',
    cancelHint: 'You can always cancel if you are not ready to use tokens right now.',
    spending: 'Spending…',
    spendTokens: (value) => `Spend ${value} tokens`,
    scriptLengthValidation: (max) => `Script must be between 1 and ${max} characters.`,
  },
  ru: {
    minCharacters: (min) => `Мин. ${min} символов`,
    refinementRequested: 'Запрос на доработку отправлен',
    refinementRequestedDescription: 'Мы уведомим вас, когда обновлённый сценарий будет готов.',
    translateRefinedTooltip: 'Уточнённый текст перезапишет сценарии во всех остальных языках проекта.',
    translateRefinedLabel: 'Перевести обновлённый сценарий',
    refinePlaceholder: 'Попросить ИИ доработать',
    notEnoughTokensToRefine: (need, have) => `Недостаточно токенов для доработки. Нужно ${need}, доступно ${have}.`,
    sending: 'Отправка…',
    send: 'Отправить',
    scriptApproved: 'Сценарий подтверждён',
    scriptApprovedDescription: 'Генерация озвучки начнётся в ближайшее время.',
    approving: 'Подтверждаем…',
    approveScripts: 'Подтвердить сценарии',
    approveScript: 'Подтвердить сценарий',
    tokensDialogTitle: 'Списать токены на доработку сценария?',
    tokensDialogDescription: 'При перегенерации сценария токены списываются сразу.',
    languageLabel: 'Язык',
    tokensUnit: 'токенов',
    balanceAfterSpend: (value) => `Баланс после списания: ${value}`,
    cancelText: 'Отмена',
    cancelHint: 'Вы всегда можете отменить, если пока не готовы списывать токены.',
    spending: 'Списываем…',
    spendTokens: (value) => `Списать ${value} токенов`,
    scriptLengthValidation: (max) => `Сценарий должен быть от 1 до ${max} символов.`,
  },
};

export function ScriptEditor({ projectId, variants, primaryLanguage, fallbackText }: ScriptEditorProps) {
  const { language } = useAppLanguage();
  const t = COPY[language];

  const initialVariants = useMemo(() => {
    if (variants.length > 0) return variants;
    return [{ languageCode: primaryLanguage, scriptText: fallbackText ?? '' }];
  }, [variants, primaryLanguage, fallbackText]);

  const initialTexts = useMemo(() => {
    const map = new Map<string, string>();
    initialVariants.forEach((variant) => {
      map.set(variant.languageCode, variant.scriptText ?? '');
    });
    if (!map.has(primaryLanguage) && fallbackText) {
      map.set(primaryLanguage, fallbackText);
    }
    return map;
  }, [initialVariants, primaryLanguage, fallbackText]);

  const [texts, setTexts] = useState(initialTexts);
  const [activeLanguage, setActiveLanguage] = useState(initialVariants[0]?.languageCode ?? primaryLanguage);
  const [sending, setSending] = useState(false);
  const [reqSending, setReqSending] = useState(false);
  const [approved, setApproved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ text: string; propagateTranslations: boolean } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const requestInputRef = useRef<HTMLInputElement | null>(null);
  const serverScriptsRef = useRef<Map<string, string>>(new Map());
  const [requestText, setRequestText] = useState('');
  const [propagateTranslations, setPropagateTranslations] = useState(true);
  const { balance: tokenBalance, summary: tokenSummary, loading: tokensLoading } = useTokenSummary();
  if (approved) return null;

  const languageOrder = useMemo(() => {
    const order = new Set<string>();
    order.add(primaryLanguage);
    initialVariants.forEach((variant) => order.add(variant.languageCode));
    texts.forEach((_value, key) => order.add(key));
    return Array.from(order);
  }, [initialVariants, texts, primaryLanguage]);

  const scriptEntries = useMemo(() => {
    return languageOrder.map((languageCode) => ({
      languageCode,
      text: texts.get(languageCode) ?? '',
      trimmedLength: (texts.get(languageCode) ?? '').trim().length,
    }));
  }, [languageOrder, texts]);

  const hasInvalidScripts = scriptEntries.some((entry) => (
    entry.trimmedLength < LIMITS.approvedScriptMin || entry.trimmedLength > LIMITS.rawScriptMax
  ));
  const primaryEntry = scriptEntries.find((entry) => entry.languageCode === primaryLanguage) ?? {
    languageCode: primaryLanguage,
    text: '',
    trimmedLength: 0,
  };
  const primaryText = primaryEntry.text;

  const regenCost = tokenSummary?.actionCosts.scriptRevision ?? TOKEN_COSTS.actions.scriptRevision;
  const hasTokensForRegen = tokenBalance >= regenCost;

  useEffect(() => {
    setTexts((prev) => {
      let changed = false;
      const next = new Map(prev);
      const languagesInPayload = new Set<string>();

      initialVariants.forEach((variant) => {
        const incoming = variant.scriptText ?? '';
        const lastSynced = serverScriptsRef.current.get(variant.languageCode);
        const current = next.get(variant.languageCode);
        const hasEntry = next.has(variant.languageCode);
        const payloadDiffers = incoming !== (lastSynced ?? '');

        if (!hasEntry) {
          if (current !== incoming) {
            next.set(variant.languageCode, incoming);
            changed = true;
          }
        } else if (payloadDiffers) {
          const currentText = current ?? '';
          const shouldUpdate = currentText.trim().length === 0 || currentText === (lastSynced ?? '');
          if (shouldUpdate && current !== incoming) {
            next.set(variant.languageCode, incoming);
            changed = true;
          }
        }

        if (payloadDiffers) {
          serverScriptsRef.current.set(variant.languageCode, incoming);
        } else if (!serverScriptsRef.current.has(variant.languageCode)) {
          serverScriptsRef.current.set(variant.languageCode, incoming);
        }

        languagesInPayload.add(variant.languageCode);
      });

      Array.from(serverScriptsRef.current.keys()).forEach((languageCode) => {
        if (!languagesInPayload.has(languageCode)) {
          serverScriptsRef.current.delete(languageCode);
        }
      });

      if (fallbackText) {
        const trimmedFallback = fallbackText.trim();
        if (trimmedFallback.length > 0) {
          const currentPrimary = next.get(primaryLanguage) ?? '';
          if (currentPrimary.trim().length === 0 && currentPrimary !== fallbackText) {
            next.set(primaryLanguage, fallbackText);
            changed = true;
            serverScriptsRef.current.set(primaryLanguage, fallbackText);
          }
        }
      }

      return changed ? next : prev;
    });
  }, [initialVariants, fallbackText, primaryLanguage]);

  const handleChange = (languageCode: string, value: string) => {
    setTexts((prev) => {
      const next = new Map(prev);
      next.set(languageCode, value);
      return next;
    });
  };

  const handleScriptRequest = async (val: string, shouldPropagate: boolean) => {
    setReqSending(true);
    try {
      await Api.requestScriptChange(projectId, {
        text: val,
        languageCode: activeLanguage,
        propagateTranslations: shouldPropagate,
      });
      setRequestText('');
      if (requestInputRef.current) requestInputRef.current.value = '';
      requestTokenRefresh();
      toast.success(t.refinementRequested, { description: t.refinementRequestedDescription });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('project:updated', {
          detail: { id: projectId, status: ProjectStatus.ProcessScript, finalScriptText: null },
        }));
      }
    } finally {
      setReqSending(false);
    }
  };
  const showInsufficient = !tokensLoading && !hasTokensForRegen;
  const disableSubmission = reqSending || showInsufficient || requestText.trim().length === 0;

  const tabItems = useMemo(
    () =>
      scriptEntries.map((entry) => ({
        languageCode: entry.languageCode,
        ready: entry.trimmedLength >= LIMITS.approvedScriptMin,
      })),
    [scriptEntries],
  );

  return (
    <div className="space-y-3">
      {languageOrder.length > 1 ? (
        <Tabs value={activeLanguage} onValueChange={setActiveLanguage}>
          <LanguageTabsList items={tabItems} listClassName="sm:gap-1" />
          {languageOrder.map((lang) => {
            const entry = scriptEntries.find((item) => item.languageCode === lang)!;
            return (
              <TabsContent key={lang} value={lang} className="mt-3">
                <Textarea
                  className="min-h-[200px]"
                  value={entry.text}
                  maxLength={LIMITS.rawScriptMax}
                  onChange={(event) => {
                    handleChange(lang, event.target.value);
                  }}
                />
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {entry.trimmedLength}/{LIMITS.rawScriptMax} • {t.minCharacters(LIMITS.approvedScriptMin)}
                  </span>
                  <span>{lang.toUpperCase()}</span>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        (() => {
          const entry = scriptEntries[0];
          return (
            <div className="mt-1">
              <Textarea
                className="min-h-[200px]"
                value={entry.text}
                maxLength={LIMITS.rawScriptMax}
                onChange={(event) => handleChange(entry.languageCode, event.target.value)}
              />
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {entry.trimmedLength}/{LIMITS.rawScriptMax} • {t.minCharacters(LIMITS.approvedScriptMin)}
                </span>
                <span>{entry.languageCode.toUpperCase()}</span>
              </div>
            </div>
          );
        })()
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={async () => {
              if (sending) return;
              setSending(true);
              try {
                await Api.approveScript(projectId, scriptEntries.map(({ languageCode, text }) => ({
                  languageCode,
                  text,
                })));
                toast.success(t.scriptApproved, { description: t.scriptApprovedDescription });
                setApproved(true);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('project:updated', {
                    detail: { id: projectId, status: ProjectStatus.ProcessAudio, finalScriptText: primaryText },
                  }));
                }
                requestTokenRefresh();
              } finally {
                setSending(false);
              }
            }}
            disabled={sending || hasInvalidScripts}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.approving}
              </>
            ) : (
              <>
                <FileCheck2 className="mr-2 h-4 w-4" />
                {languageOrder.length > 1 ? t.approveScripts : t.approveScript}
              </>
            )}
          </Button>
        </div>
        <form
          className="flex flex-col sm:flex-row sm:items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reqSending || showInsufficient) return;
            const input = (e.currentTarget.elements.namedItem('req') as HTMLInputElement);
            const val = input?.value?.trim();
            if (!val) return;
            const shouldPropagate = propagateTranslations;
            if ((regenCost ?? 0) > 0 && !tokensLoading) {
              setPendingRequest({ text: val, propagateTranslations: shouldPropagate });
              setConfirmOpen(true);
              return;
            }
            await handleScriptRequest(val, shouldPropagate);
          }}
        >
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Checkbox
                id="refine-propagate"
                checked={propagateTranslations}
                onCheckedChange={(checked) => setPropagateTranslations(checked === true)}
              />
              <Tooltip content={t.translateRefinedTooltip} side="top">
                <Label htmlFor="refine-propagate" className="cursor-help text-sm font-medium text-gray-800 dark:text-gray-200">
                  {t.translateRefinedLabel}
                </Label>
              </Tooltip>
            </div>
            <Input
              name="req"
              placeholder={t.refinePlaceholder}
              ref={requestInputRef}
              className="w-full sm:flex-1"
              disabled={showInsufficient}
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
            />
          </div>
          <Tooltip
            content={t.notEnoughTokensToRefine(regenCost, tokenBalance)}
            disabled={!showInsufficient}
            side="top"
            align="center"
          >
            <Button
              type="submit"
              variant="outline"
              disabled={disableSubmission}
              aria-busy={reqSending}
              className="shrink-0 w-full sm:w-auto"
            >
              {reqSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.sending}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {t.send}
                </>
              )}
            </Button>
          </Tooltip>
        </form>
      </div>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setPendingRequest(null);
            setConfirmSubmitting(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.tokensDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t.tokensDialogDescription}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">{t.languageLabel}:</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200">
                <span>{getLanguageFlag(activeLanguage)}</span> {activeLanguage.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-amber-600 dark:bg-amber-950/60">
                <Coins className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">{regenCost} {t.tokensUnit}</div>
                <div className="text-xs text-amber-700/80 dark:text-amber-200/80">{t.balanceAfterSpend(Math.max(tokenBalance - (regenCost ?? 0), 0))}</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t.cancelHint}</p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              {t.cancelText}
            </Button>
            <Button
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50 dark:border-red-400 dark:text-red-300 dark:hover:bg-red-950/40"
              disabled={confirmSubmitting || !pendingRequest}
              onClick={async () => {
                if (!pendingRequest) return;
                setConfirmSubmitting(true);
                try {
                  await handleScriptRequest(pendingRequest.text, pendingRequest.propagateTranslations);
                  setPendingRequest(null);
                  setConfirmOpen(false);
                } finally {
                  setConfirmSubmitting(false);
                }
              }}
            >
              {confirmSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.spending}
                </>
              ) : (
                <>
                  {t.spendTokens(regenCost)}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
