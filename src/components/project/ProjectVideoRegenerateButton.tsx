"use client";

import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { ProjectStatus } from '@/shared/constants/status';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Api } from '@/lib/api-client';
import { toast } from 'sonner';
import { useAppLanguage } from '@/components/providers/AppLanguageProvider';
import type { AppLanguageCode } from '@/shared/constants/app-language';

type Props = {
  projectId: string;
  projectStatus: ProjectStatus;
  canRecreate?: boolean;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'success';
  className?: string;
};

export function ProjectVideoRegenerateButton({
  projectId,
  projectStatus,
  canRecreate,
  size = 'sm',
  variant = 'default',
  className,
}: Props) {
  const { language } = useAppLanguage();
  const copy: Record<AppLanguageCode, {
    regenerateVideo: string;
    regenerateVideoQuestion: string;
    dialogDescription: string;
    warning: string;
    cancel: string;
    regenerate: string;
    queuedTitle: string;
    queuedDescription: string;
  }> = {
    en: {
      regenerateVideo: 'Regenerate video',
      regenerateVideoQuestion: 'Regenerate video?',
      dialogDescription: 'This will re-render all video parts using the latest template images.',
      warning: 'Existing video outputs will be replaced once the new render completes.',
      cancel: 'Cancel',
      regenerate: 'Regenerate',
      queuedTitle: 'Video regenerate queued',
      queuedDescription: 'We will re-render the video shortly.',
    },
    ru: {
      regenerateVideo: 'Перегенерировать видео',
      regenerateVideoQuestion: 'Перегенерировать видео?',
      dialogDescription: 'Мы заново отрендерим все части видео с последними изображениями шаблона.',
      warning: 'Текущие видеофайлы будут заменены после завершения нового рендера.',
      cancel: 'Отмена',
      regenerate: 'Перегенерировать',
      queuedTitle: 'Перегенерация видео запущена',
      queuedDescription: 'Мы скоро перерендерим видео.',
    },
  };
  const t = copy[language];

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!canRecreate || projectStatus !== ProjectStatus.Done) return null;

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        {t.regenerateVideo}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="flex-col items-start gap-1 text-left">
            <DialogTitle className="text-lg font-semibold leading-tight">{t.regenerateVideoQuestion}</DialogTitle>
            <DialogDescription>
              {t.dialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {t.warning}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              {t.cancel}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (loading) return;
                setLoading(true);
                try {
                  await Api.recreateProjectVideo(projectId);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('project:updated', {
                      detail: { id: projectId, status: ProjectStatus.ProcessVideoPartsGeneration },
                    }));
                  }
                  toast.success(t.queuedTitle, { description: t.queuedDescription });
                  setOpen(false);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {t.regenerate}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
