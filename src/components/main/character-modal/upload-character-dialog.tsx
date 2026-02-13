import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { UploadCloud, Loader2 } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LIMITS } from '@/shared/constants/limits';
import { generateRandomCharacterName } from '../helpers';

type UploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
  storageBaseUrl: string;
};

export function UploadCharacterDialog({ open, onOpenChange, onUploaded, storageBaseUrl }: UploadDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    event.target.value = '';
  };

  useEffect(() => {
    if (open) return;
    setTitle('');
    setDescription('');
    setFile(null);
    setSubmitting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Select an image to upload');
      return;
    }
    const preparedTitle = title.trim() || generateRandomCharacterName();
    setSubmitting(true);
    try {
      const grant = await Api.createCharacterUploadToken();
      if (!grant?.data || !grant.signature) {
        throw new Error('Failed to obtain upload authorization');
      }
      if (!grant.mimeTypes.includes(file.type)) {
        throw new Error('Selected file type is not allowed');
      }
      if (file.size > grant.maxBytes) {
        throw new Error(`File is too large. Maximum size is ${Math.floor(grant.maxBytes / 1024 / 1024)}MB`);
      }
      const form = new FormData();
      form.set('file', file);
      form.set('data', grant.data);
      form.set('signature', grant.signature);
      const target = `${storageBaseUrl.replace(/\/$/, '')}/api/storage/user-images`;
      const response = await fetch(target, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Storage upload failed (${response.status})`);
      }
      const payload = await response.json();
      if (!payload?.path || !payload?.url || !payload?.data || !payload?.signature) {
        throw new Error('Storage response missing metadata');
      }
      await Api.completeCharacterUpload({
        data: payload.data,
        signature: payload.signature,
        path: payload.path,
        url: payload.url,
        title: preparedTitle,
        description: description.trim() || undefined,
      });
      toast.success('Character uploaded');
      onOpenChange(false);
      onUploaded();
    } catch (err: any) {
      console.error('Upload failed', err);
      toast.error(err?.message || 'Failed to upload character');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload custom character</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="character-file">Character image</Label>
            <Input
              ref={fileInputRef}
              id="character-file"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
                Choose file
              </Button>
              <span className="truncate text-sm text-muted-foreground">
                {file?.name ?? 'PNG or JPG, up to 1024×1024'}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="character-name">Name (optional)</Label>
            <Input
              id="character-name"
              value={title}
              maxLength={LIMITS.titleMax}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Summer Campaign Avatar"
            />
            <p className="text-right text-xs text-muted-foreground">
              {title.length}/{LIMITS.titleMax}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="character-description">Description (optional)</Label>
            <Textarea
              id="character-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={LIMITS.customCharacterDescriptionMax}
              placeholder="Short note about this avatar"
              className="min-h-[80px]"
            />
            <p className="text-right text-xs text-muted-foreground">
              {description.length}/{LIMITS.customCharacterDescriptionMax}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
