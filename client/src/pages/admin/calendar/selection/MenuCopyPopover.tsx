import { useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MultiDatePicker } from './MultiDatePicker';
import { useMenuCopy, CONFLICT_OPTIONS, type CopyDirection } from './useMenuCopy';

interface MenuCopyPopoverProps {
    direction: CopyDirection;
    restaurantId: number | undefined;
    onDone: () => void;
    /** export : plats à copier */
    sourceItems?: MenuItem[];
    /** import : jour de destination */
    targetDate?: string;
    /** Mode bouton : élément déclencheur rendu dans un PopoverTrigger */
    children?: ReactNode;
    /** Mode contrôlé : ouverture pilotée par le parent */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Point d'ancrage virtuel (clic droit) */
    anchorPoint?: { x: number; y: number } | null;
    align?: 'start' | 'center' | 'end';
}

const TEXT = {
    export: {
        title: 'Dupliquer la sélection',
        datesLabel: 'Dates cibles',
        cta: (n: number) => `Dupliquer (${n})`,
    },
    import: {
        title: 'Importer un menu',
        datesLabel: 'Jours sources',
        cta: (n: number) => `Importer (${n})`,
    },
} as const;

export function MenuCopyPopover({
    direction,
    restaurantId,
    onDone,
    sourceItems = [],
    targetDate,
    children,
    open: openProp,
    onOpenChange,
    anchorPoint,
    align = 'end',
}: MenuCopyPopoverProps) {
    const isControlled = openProp !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isControlled ? openProp : internalOpen;

    const setOpen = (next: boolean) => {
        if (isControlled) onOpenChange?.(next);
        else setInternalOpen(next);
    };

    const copy = useMenuCopy({
        direction,
        restaurantId,
        sourceItems,
        targetDate,
        onDone: () => { setOpen(false); onDone(); },
    });

    const handleOpenChange = (next: boolean) => {
        if (!next) copy.reset();
        setOpen(next);
    };

    const t = TEXT[direction];

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            {anchorPoint && (
                <PopoverAnchor asChild>
                    <div style={{ position: 'fixed', left: anchorPoint.x, top: anchorPoint.y, width: 0, height: 0 }} />
                </PopoverAnchor>
            )}
            {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}

            <PopoverContent
                align={align}
                collisionPadding={8}
                className="w-80 p-0 overflow-hidden flex flex-col max-h-[var(--radix-popover-content-available-height)]"
            >
                <div className="px-4 py-3 border-b border-border shrink-0">
                    <p className="text-sm font-semibold">{t.title}</p>
                    {direction === 'export' && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {sourceItems.length} plat{sourceItems.length > 1 ? 's' : ''} à copier
                        </p>
                    )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                    {direction === 'export' && sourceItems.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {sourceItems.slice(0, 6).map((item, i) => (
                                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full truncate max-w-[120px]">
                                    {item.dish?.name ?? ''}
                                </span>
                            ))}
                            {sourceItems.length > 6 && (
                                <span className="text-xs text-muted-foreground self-center">+{sourceItems.length - 6}</span>
                            )}
                        </div>
                    )}

                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">{t.datesLabel}</p>
                        <MultiDatePicker selected={copy.dates} onChange={copy.setDates} />
                        {copy.dates.size > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {Array.from(copy.dates).sort().map(date => (
                                    <span key={date} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                        {date}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const next = new Set(copy.dates);
                                                next.delete(date);
                                                copy.setDates(next);
                                            }}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">En cas de conflit</p>
                        <div className="space-y-1">
                            {CONFLICT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => copy.setConflictMode(opt.value)}
                                    className={cn(
                                        'w-full flex items-start gap-3 p-2.5 rounded-xl border text-left transition-colors',
                                        copy.conflictMode === opt.value
                                            ? 'bg-primary/10 border-primary'
                                            : 'border-border hover:bg-muted',
                                    )}
                                >
                                    <span className={cn(
                                        'w-4 h-4 rounded-full border-2 mt-0.5 shrink-0',
                                        copy.conflictMode === opt.value ? 'border-primary bg-primary' : 'border-muted-foreground',
                                    )} />
                                    <div>
                                        <p className="text-sm font-medium">{opt.label}</p>
                                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {copy.error && <p className="text-sm text-destructive">{copy.error}</p>}
                </div>

                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={copy.isSaving}>
                        Annuler
                    </Button>
                    <Button size="sm" onClick={copy.run} disabled={copy.isSaving || copy.dates.size === 0}>
                        {copy.isSaving ? '…' : t.cta(copy.dates.size)}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
