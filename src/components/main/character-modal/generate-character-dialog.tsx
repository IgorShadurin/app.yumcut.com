import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LIMITS } from '@/shared/constants/limits';
import { TOKEN_COSTS } from '@/shared/constants/token-costs';

type GenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequested: () => void;
};

export function GenerateCharacterDialog({ open, onOpenChange, onRequested }: GenerateDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) return;
    setTitle('');
    setDescription('');
    setSubmitting(false);
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Give your character a name');
      return;
    }
    if (description.trim().length < 10) {
      toast.error('Describe the character (at least 10 characters)');
      return;
    }
    setSubmitting(true);
    try {
      await Api.generateCharacterImage({
        title: title.trim(),
        description: description.trim(),
      });
      toast.success('Character generation queued');
      onOpenChange(false);
      onRequested();
    } catch (err: any) {
      console.error('Generation failed', err);
      toast.error(err?.error?.message || err?.message || 'Failed to start generation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate custom character</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            This action costs <strong>{TOKEN_COSTS.actions.characterImage} tokens</strong>. We’ll notify you here once the avatar is ready.
          </div>
          <div className="space-y-2">
            <Label htmlFor="generate-name">Name</Label>
            <Input
              id="generate-name"
              value={title}
              maxLength={LIMITS.titleMax}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Friendly Support Agent"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="generate-description">Prompt</Label>
            <Textarea
              id="generate-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={LIMITS.customCharacterPromptMax}
              placeholder="Describe how the character should look, style, outfit, mood, etc."
              className="min-h-[120px]"
            />
            <p className="text-right text-xs text-muted-foreground">
              {description.length}/{LIMITS.customCharacterPromptMax}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
