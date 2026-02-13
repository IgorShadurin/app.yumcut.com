'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Api } from '@/lib/api-client';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type DeleteAccountCopy = {
  toastDeleted: string;
  title: string;
  description: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  charsRemaining: (remaining: number) => string;
  deleteButton: string;
  dialogTitle: string;
  dialogDescription: string;
  cancel: string;
  deleting: string;
  confirmDelete: string;
};

const COPY: Record<AppLanguageCode, DeleteAccountCopy> = {
  en: {
    toastDeleted: 'Your YumCut account has been deleted.',
    title: 'Delete account',
    description: 'Removing your account permanently deletes all projects, custom characters, token history, and sessions. This action cannot be undone.',
    reasonLabel: 'Reason for leaving (optional)',
    reasonPlaceholder: "Let us know why you're leaving so we can improve YumCut.",
    charsRemaining: (remaining) => `${remaining} characters remaining`,
    deleteButton: 'Permanently delete account',
    dialogTitle: 'Delete your YumCut account?',
    dialogDescription: "This will immediately revoke access, remove every project, clear saved characters, and erase remaining tokens. You'll need to create a new account to use YumCut again.",
    cancel: 'Cancel',
    deleting: 'Deleting…',
    confirmDelete: 'Yes, delete everything',
  },
  ru: {
    toastDeleted: 'Ваш аккаунт ЯмКат удален.',
    title: 'Удаление аккаунта',
    description: 'Удаление аккаунта навсегда удалит все проекты, кастомных персонажей, историю токенов и сессии. Это действие нельзя отменить.',
    reasonLabel: 'Причина ухода (необязательно)',
    reasonPlaceholder: 'Расскажите, почему уходите, чтобы мы могли улучшить ЯмКат.',
    charsRemaining: (remaining) => `Осталось символов: ${remaining}`,
    deleteButton: 'Удалить аккаунт навсегда',
    dialogTitle: 'Удалить аккаунт ЯмКат?',
    dialogDescription: 'Доступ будет немедленно отозван, все проекты и сохранённые персонажи удалены, оставшиеся токены списаны. Для использования ЯмКат нужно будет создать новый аккаунт.',
    cancel: 'Отмена',
    deleting: 'Удаляем…',
    confirmDelete: 'Да, удалить всё',
  },
};

export function DeleteAccountCard() {
  const { language } = useAppLanguage();
  const copy = COPY[language];
  const [reason, setReason] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const trimmedReason = reason.trim();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const payload = trimmedReason.length ? { reason: trimmedReason } : undefined;
        const result = await Api.deleteAccount(payload);
        toast.success(result.message || copy.toastDeleted);
        setDialogOpen(false);
        setReason('');
        try {
          await signOut({ callbackUrl: '/' });
        } catch {
          router.push('/');
        }
      } catch (err) {
        // api() already surfaced toast; leave dialog open for retries
        console.error('Account deletion failed', err);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-gray-600 dark:text-gray-300">
          {copy.description}
        </p>
        <div className="space-y-2">
          <Label htmlFor="delete-reason">{copy.reasonLabel}</Label>
          <Textarea
            id="delete-reason"
            value={reason}
            maxLength={512}
            onChange={(event) => setReason(event.currentTarget.value)}
            placeholder={copy.reasonPlaceholder}
            className="min-h-[90px]"
          />
          <p className="text-xs text-muted-foreground">{copy.charsRemaining(512 - reason.length)}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="destructive">
              {copy.deleteButton}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader className="flex-col items-start gap-2">
              <DialogTitle>{copy.dialogTitle}</DialogTitle>
              <DialogDescription>
                {copy.dialogDescription}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={handleDelete}
              >
                {isPending ? copy.deleting : copy.confirmDelete}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
