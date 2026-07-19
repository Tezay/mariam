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
    onDone: () => {
      setOpen(false);
      onDone();
    },
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
          <div
            style={{
              position: 'fixed',
              left: anchorPoint.x,
              top: anchorPoint.y,
              width: 0,
              height: 0,
            }}
          />
        </PopoverAnchor>
      )}
      {children && <PopoverTrigger asChild>{children}</PopoverTrigger>}

      <PopoverContent
        align={align}
        collisionPadding={8}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-80 flex-col overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t.title}</p>
          {direction === 'export' && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sourceItems.length} plat{sourceItems.length > 1 ? 's' : ''} à copier
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {direction === 'export' && sourceItems.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sourceItems.slice(0, 6).map((item, i) => (
                <span
                  key={i}
                  className="max-w-[120px] truncate rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {item.dish?.name ?? ''}
                </span>
              ))}
              {sourceItems.length > 6 && (
                <span className="self-center text-xs text-muted-foreground">
                  +{sourceItems.length - 6}
                </span>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t.datesLabel}</p>
            <MultiDatePicker selected={copy.dates} onChange={copy.setDates} />
            {copy.dates.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Array.from(copy.dates)
                  .sort()
                  .map((date) => (
                    <span
                      key={date}
                      className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                    >
                      {date}
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(copy.dates);
                          next.delete(date);
                          copy.setDates(next);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">En cas de conflit</p>
            <div className="space-y-1">
              {CONFLICT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => copy.setConflictMode(opt.value)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-colors',
                    copy.conflictMode === opt.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2',
                      copy.conflictMode === opt.value
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground'
                    )}
                  />
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

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={copy.isSaving}
          >
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
