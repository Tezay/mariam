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

export function ChefNotePopover({ editor, compact = false, side = 'top', align = 'start' }: ChefNotePopoverProps) {
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
                        'relative rounded-xl flex items-center justify-center hover:bg-muted transition-colors',
                        compact ? 'w-6 h-6' : 'w-8 h-8',
                    )}
                >
                    <ChefHat className={cn(compact ? 'w-3.5 h-3.5' : 'w-4 h-4', hasNote ? 'text-amber-600' : 'text-muted-foreground')} />
                    {hasNote && (
                        <span className={cn('absolute rounded-full bg-amber-500', compact ? 'top-0.5 right-0.5 w-1 h-1' : 'top-1 right-1 w-1.5 h-1.5')} />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                side={side}
                align={align}
                className="w-72 p-3"
                onOpenAutoFocus={() => setTimeout(() => textareaRef.current?.focus(), 50)}
            >
                <p className="text-xs font-semibold text-muted-foreground mb-2">Note du chef</p>
                <textarea
                    ref={textareaRef}
                    value={chefNote}
                    onChange={e => setChefNote(e.target.value)}
                    placeholder="Ajouter une note du chef…"
                    rows={3}
                    maxLength={300}
                    className="w-full text-sm bg-transparent border border-border rounded-lg px-2 py-1.5 outline-none resize-none focus:border-primary transition-colors"
                />
                {chefNote.length > 0 && (
                    <p className="text-[10px] text-muted-foreground text-right mt-1">{chefNote.length}/300</p>
                )}
            </PopoverContent>
        </Popover>
    );
}
