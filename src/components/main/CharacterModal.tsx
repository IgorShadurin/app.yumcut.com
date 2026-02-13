"use client";

import { useCallback, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, UploadCloud, Sparkles, RefreshCw } from 'lucide-react';
import { CharacterGrid } from './character-modal/character-grid';
import { UploadCharacterDialog } from './character-modal/upload-character-dialog';
import { GenerateCharacterDialog } from './character-modal/generate-character-dialog';
import { useCharacterCollections } from './character-modal/use-character-collections';
import { resolveStorageBaseUrl } from './character-modal/storage';
import type { CharacterSelection } from './character-modal/types';

type CharacterModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: CharacterSelection | null) => void;
  currentSelection: CharacterSelection | null;
};

export function CharacterModal({ open, onClose, onSelect, currentSelection }: CharacterModalProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const storageBaseUrl = useMemo(resolveStorageBaseUrl, []);

  const { collections, loading, pendingCount, refresh, handleVariationDeleted } = useCharacterCollections(
    open,
    currentSelection,
    () => onSelect(null),
  );

  const handleSelect = useCallback((selection: CharacterSelection | null) => {
    onSelect(selection);
    onClose();
  }, [onClose, onSelect]);

  const selectedVariationId = currentSelection?.variationId ?? null;
  const selectedSource = currentSelection?.source ?? null;

  const globalSelectedId = useMemo(() => {
    if (selectedSource === 'global') return selectedVariationId;
    if (selectedSource === 'dynamic') return '__dynamic__';
    return null;
  }, [selectedSource, selectedVariationId]);

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent
        className="max-w-5xl max-h-[80vh] overflow-hidden"
        ariaDescription="Choose or upload a character avatar for this project"
      >
        <DialogHeader>
          <DialogTitle className="font-semibold">Choose a character</DialogTitle>
          <DialogDescription className="sr-only">
            Choose an avatar from your library or the global list, or upload a new one.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Select from the library or create your own custom avatar.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Upload image
                </Button>
                {false && (
                  <Button variant="secondary" size="sm" onClick={() => setGenerateOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate custom
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleSelect(null)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset to default
                </Button>
              </div>
            </div>

            {pendingCount > 0 ? (
              <Card className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <CardContent className="flex items-center gap-3 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <div className="text-sm">
                    {pendingCount === 1
                      ? 'One custom character is generating. This panel refreshes automatically.'
                      : `${pendingCount} custom characters are generating. This panel refreshes automatically.`}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <CharacterGrid
              title="My characters"
              description="Your uploaded or generated avatars."
              characters={collections.mine}
              loading={loading && collections.mine.length === 0}
              selectedVariationId={selectedSource === 'user' ? selectedVariationId : null}
              onSelect={(record) => handleSelect(record)}
              source="user"
              onDeleted={handleVariationDeleted}
              emptyPlaceholder={
                <div className="rounded-md border border-dashed border-muted-foreground/30 p-6 text-center text-sm text-muted-foreground">
                  You haven’t added any custom characters yet.
                </div>
              }
            />

            <Separator />

            <CharacterGrid
              title="Global library"
              description="Ready-made characters you can use immediately."
              characters={collections.global}
              loading={loading && collections.global.length === 0}
              selectedVariationId={globalSelectedId}
              onSelect={(record) => handleSelect(record)}
              source="global"
            />
          </div>
        </ScrollArea>
      </DialogContent>

      <UploadCharacterDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          void refresh();
        }}
        storageBaseUrl={storageBaseUrl}
      />

      <GenerateCharacterDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onRequested={() => {
          void refresh();
        }}
      />
    </Dialog>
  );
}

export type { CharacterSelection } from './character-modal/types';
