"use client";

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ProjectStatus } from '@/shared/constants/status';
import { STATUS_INFO, statusLabel } from '@/shared/constants/status-info';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';
import { StatusIcon } from '@/components/common/StatusIcon';
import type { ProjectLanguageProgressStateDTO } from '@/shared/types';
import { getLanguageFlag, getLanguageLabel } from '@/shared/constants/languages';

type Props = {
  projectId: string;
  current: ProjectStatus;
  languages: ProjectLanguageProgressStateDTO[];
};

export function AdminProjectStatusChanger({ projectId, current, languages }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<ProjectStatus>(current);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(() => new Set(languages.map((l) => l.languageCode)));

  useEffect(() => {
    setSelectedLanguages(new Set(languages.map((l) => l.languageCode)));
  }, [languages]);

  const options = useMemo(() => Object.values(ProjectStatus) as ProjectStatus[], []);
  const currentLabel = statusLabel(current);
  const nextLabel = statusLabel(value);
  const dirty = value !== current;
  const sortedLanguages = useMemo(
    () => [...languages].sort((a, b) => a.languageCode.localeCompare(b.languageCode)),
    [languages],
  );
  const noneSelected = selectedLanguages.size === 0;

  function toggleLanguage(code: string, enabled: boolean) {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function submitChange() {
    const languagesToReset = Array.from(selectedLanguages);
    startTransition(async () => {
      try {
        await Api.adminUpdateProjectStatus(projectId, { status: value, languagesToReset });
        setConfirmOpen(false);
        router.refresh();
      } catch (_) {
        // api-client already shows a toast
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={(v) => setValue(v as ProjectStatus)}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {options.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <StatusIcon status={s} size={14} />
                  <span>{STATUS_INFO[s]?.label || s}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button disabled={!dirty || pending}>Change</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change status</DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-left">
              Are you sure you want to change status from “{currentLabel}” ({current}) to “{nextLabel}” ({value})?
            </DialogDescription>
            <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              {sortedLanguages.length > 0 ? (
                <p>
                  The following languages will be reset: {selectedLanguages.size > 0 ? Array.from(selectedLanguages).join(', ') : 'none (warning)'}.
                </p>
              ) : null}
              {noneSelected ? (
                <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    No languages selected. The status will change, but no language progress or failures will be reset, so the daemon
                    may still report “No active languages”.
                  </span>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={submitChange}
              >
                {pending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Changing…</>) : 'Change status'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        Selected: {nextLabel}
        <span className="ml-2 text-[11px] text-gray-500">({value})</span>
      </p>
      {sortedLanguages.length > 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">Reset language failures</p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Checked languages will have their failure state cleared (including <code className="text-[10px]">disabled</code>) the next time this stage runs.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sortedLanguages.map((lang) => {
              const checked = selectedLanguages.has(lang.languageCode);
              return (
                <label key={lang.languageCode} className="flex cursor-pointer items-start gap-2 rounded border border-transparent p-2 hover:border-gray-200 dark:hover:border-gray-700">
                  <Checkbox
                    id={`lang-${lang.languageCode}`}
                    checked={checked}
                    disabled={pending}
                    onCheckedChange={(checkedState) => toggleLanguage(lang.languageCode, checkedState === true)}
                  />
                  <div className="space-y-1 text-sm leading-tight">
                    <div className="flex items-center gap-2">
                      <span>{getLanguageFlag(lang.languageCode)}</span>
                      <span className="font-medium">{getLanguageLabel(lang.languageCode)}</span>
                      <span className="text-[11px] uppercase text-gray-500">{lang.languageCode}</span>
                    </div>
                    {lang.disabled ? (
                      <p className="text-xs text-red-500">
                        Disabled{lang.failedStep ? ` (${lang.failedStep})` : ''}{lang.failureReason ? ` – ${lang.failureReason}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-600">Active</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
          {noneSelected ? (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              No languages selected — status will change without resetting failures.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No languages available for this project.</p>
      )}
    </div>
  );
}
