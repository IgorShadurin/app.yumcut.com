import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles, ImageOff, MoreVertical, Trash2, AlertTriangle } from 'lucide-react';
import { Api } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { CharacterRecord, CharacterSelection, CharacterVariationRecord } from './types';

type CharacterGridProps = {
  title: string;
  description: string;
  characters: CharacterRecord[];
  loading: boolean;
  selectedVariationId: string | null;
  source: 'global' | 'user';
  onSelect: (selection: CharacterSelection) => void;
  emptyPlaceholder?: ReactNode;
  onDeleted?: (payload: { characterId: string; variationId: string; source: 'global' | 'user' }) => void;
};

export function CharacterGrid({
  title,
  description,
  characters,
  loading,
  selectedVariationId,
  source,
  onSelect,
  emptyPlaceholder,
  onDeleted,
}: CharacterGridProps) {
  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {loading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
        </div>
      ) : characters.length === 0 ? (
        emptyPlaceholder || null
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {characters.flatMap((character) =>
            character.variations.map((variation) => (
              <CharacterCard
                key={variation.id}
                source={source}
                characterId={character.id}
                characterTitle={character.title}
                variation={variation}
                selected={selectedVariationId === variation.id}
                onSelect={onSelect}
                onDeleted={onDeleted}
              />
            )),
          )}
        </div>
      )}
    </section>
  );
}

type CharacterCardProps = {
  source: 'global' | 'user';
  characterId: string;
  characterTitle: string;
  variation: CharacterVariationRecord;
  selected: boolean;
  onSelect: (selection: CharacterSelection) => void;
  onDeleted?: (payload: { characterId: string; variationId: string; source: 'global' | 'user' }) => void;
};

function CharacterCard({ source, characterId, characterTitle, variation, selected, onSelect, onDeleted }: CharacterCardProps) {
  const isDynamic = source === 'global' && (variation.id === '__dynamic__' || characterId === '__dynamic__');
  const disabled = variation.status !== 'ready';
  const isUserCharacter = source === 'user';
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const shouldIgnoreEvent = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-character-menu="true"]'));
  };

  const handleSelect = () => {
    if (disabled) return;
    if (isDynamic) {
      onSelect({
        source: 'dynamic',
        variationId: undefined,
        characterTitle: 'Dynamic',
        variationTitle: 'Auto-generate',
        imageUrl: null,
        status: 'processing',
      });
    } else {
      onSelect({
        source,
        characterId: source === 'global' ? characterId : undefined,
        userCharacterId: source === 'user' ? characterId : undefined,
        variationId: variation.id,
        characterTitle,
        variationTitle: variation.title ?? null,
        imageUrl: variation.imageUrl ?? null,
        status: variation.status,
      });
    }
  };

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (shouldIgnoreEvent(event.target)) return;
    handleSelect();
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (shouldIgnoreEvent(event.target)) return;
      event.preventDefault();
      handleSelect();
    }
  };

  const handleDeleteRequest = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setMenuOpen(false);
    setConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await Api.deleteUserCharacterVariation(characterId, variation.id);
      toast.success('Character deleted');
      onDeleted?.({ characterId, variationId: variation.id, source });
      setConfirmOpen(false);
    } catch (err) {
      console.error('Failed to delete character variation', err);
      const message = (err as any)?.error?.message || (err as any)?.message || 'Failed to delete character';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={cn(
          'relative overflow-hidden transition-all hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          selected ? 'border-primary shadow-sm' : '',
          disabled ? 'pointer-events-none opacity-70' : 'cursor-pointer',
        )}
      >
        <CardContent className="p-0">
          <div className="mx-auto aspect-[9/16] h-36 w-auto overflow-hidden rounded-md bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-900 dark:via-gray-950 dark:to-black">
            {variation.imageUrl ? (
              <img
                src={variation.imageUrl}
                alt={variation.title || characterTitle}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : isDynamic ? (
              <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400">
                <div className="rounded-full bg-white/10 p-3 shadow-lg backdrop-blur ring-2 ring-white/40">
                  <Sparkles className="h-8 w-8 text-white drop-shadow" />
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-8 w-8" />
              </div>
            )}
            {variation.status === 'processing' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="mt-2 text-xs text-muted-foreground">Generating...</p>
              </div>
            ) : variation.status === 'failed' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                <p className="text-xs text-red-500">Generation failed</p>
              </div>
            ) : null}
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-1 text-sm font-medium text-foreground">{variation.title || characterTitle}</p>
                {variation.description ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{variation.description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center">
                {isUserCharacter ? (
                  <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Character actions"
                        title="Character actions"
                        className="h-7 w-7 rounded-full"
                        data-character-menu="true"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 p-1" data-character-menu="true">
                      <button
                        type="button"
                        onClick={handleDeleteRequest}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        data-character-menu="true"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="text-sm">Delete</span>
                      </button>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {isUserCharacter ? (
        <Dialog
          open={confirmOpen}
          onOpenChange={(next) => {
            setConfirmOpen(next);
            if (!next) setDeleting(false);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete character?</DialogTitle>
              <DialogDescription className="sr-only">
                Confirm removing this custom avatar from your library.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This removes the custom character variation from your library. You can’t undo this action.
            </p>
            <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm leading-5">
                Projects that used this avatar will fall back to the default character the next time they load.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
