import { useRef } from 'react';
import { ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UseMenuEditorReturn } from './useMenuEditor';

interface ChefNotePopoverProps {
  editor: UseMenuEditorReturn;
  /** Version compacte (header de colonne semaine). */
  compact?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export function ChefNotePopover({
  editor,
  compact = false,
  side = 'top',
  align = 'start',
}: ChefNotePopoverProps) {
  const { chefNote, setChefNote } = editor;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasNote = chefNote.trim().length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Note du chef"
          className={cn(
            'relative flex items-center justify-center rounded-xl transition-colors hover:bg-muted',
            compact ? 'h-6 w-6' : 'h-8 w-8'
          )}
        >
          <ChefHat
            className={cn(
              compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
              hasNote ? 'text-amber-600' : 'text-muted-foreground'
            )}
          />
          {hasNote && (
            <span
              className={cn(
                'absolute rounded-full bg-amber-500',
                compact ? 'right-0.5 top-0.5 h-1 w-1' : 'right-1 top-1 h-1.5 w-1.5'
              )}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-72 p-3"
        onOpenAutoFocus={() => setTimeout(() => textareaRef.current?.focus(), 50)}
      >
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Note du chef</p>
        <textarea
          ref={textareaRef}
          value={chefNote}
          onChange={(e) => setChefNote(e.target.value)}
          placeholder="Ajouter une note du chef…"
          rows={3}
          maxLength={300}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm outline-none transition-colors focus:border-primary"
        />
        {chefNote.length > 0 && (
          <p className="mt-1 text-right text-[10px] text-muted-foreground">{chefNote.length}/300</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
