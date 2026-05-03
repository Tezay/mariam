import { Plus, CalendarOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { getMenuChipStyle, getEventChipStyle } from './calendar-colors';
import { generateEventPalette } from '@/lib/color-utils';
import type { DayData } from './useCalendarData';
import type { Menu, Event, ExceptionalClosure } from '@/lib/api';

// ─── Actions contextuelles ────────────────────────────────────────────────────

export interface DayCellActions {
    onAddMenu: (date: string) => void;
    onAddEvent: (date: string) => void;
    onAddClosure: (date: string) => void;
    onEditMenu: (menu: Menu) => void;
    onEditEvent: (event: Event) => void;
    onEditClosure: (closure: ExceptionalClosure) => void;
    onPublishMenu: (menu: Menu) => void;
    onUnpublishMenu: (menu: Menu) => void;
    onDeleteMenu: (menu: Menu) => void;
    onPublishEvent: (event: Event) => void;
    onUnpublishEvent: (event: Event) => void;
    onDeleteEvent: (event: Event) => void;
    onDuplicateEvent: (event: Event) => void;
    onDeleteClosure: (closure: ExceptionalClosure) => void;
    // D&D
    onMenuDragStart: (date: string, menu: Menu) => void;
    onMenuDrop: (targetDate: string) => void;
}

// ─── Inline chips ─────────────────────────────────────────────────────────────

function MenuChip({ menu, size, draggable, onDragStart, onClick }: {
    menu: Menu;
    size: 'xs' | 'sm';
    draggable?: boolean;
    onDragStart?: () => void;
    onClick?: () => void;
}) {
    const style = getMenuChipStyle(menu.status === 'draft');
    const firstItem = menu.items?.[0]?.name;
    const label = firstItem
        ? (size === 'xs' ? firstItem.slice(0, 16) : firstItem)
        : 'Menu du jour';
    return (
        <div
            className={cn(
                'rounded-full px-2 truncate font-medium select-none',
                size === 'xs' ? 'text-[10px] py-0.5' : 'text-xs py-0.5',
                onClick && 'cursor-pointer hover:opacity-80',
                draggable && 'cursor-grab active:cursor-grabbing',
            )}
            style={{ ...style, border: style.border }}
            draggable={draggable}
            onDragStart={onDragStart}
            onClick={onClick}
        >
            {label}
        </div>
    );
}

function EventChip({ event, size, onClick }: {
    event: Event;
    size: 'xs' | 'sm';
    onClick?: () => void;
}) {
    const style = getEventChipStyle(event.status === 'draft', event.color);
    const palette = generateEventPalette(event.color || '#3498DB');
    return (
        <div
            className={cn(
                'rounded-full px-2 truncate font-medium select-none',
                size === 'xs' ? 'text-[10px] py-0.5' : 'text-xs py-0.5',
                onClick && 'cursor-pointer hover:opacity-80',
            )}
            style={{
                backgroundColor: style.backgroundColor,
                color: palette.text,
                border: style.border,
                backgroundImage: style.backgroundImage,
            }}
            onClick={onClick}
        >
            {event.title}
        </div>
    );
}

// ─── CalendarDayCell ──────────────────────────────────────────────────────────

interface CalendarDayCellProps {
    date: string;
    dayNumber: number;
    dayLabel?: string;
    isToday: boolean;
    isCurrentMonth?: boolean;
    data: DayData | undefined;
    canEdit: boolean;
    chipSize?: 'xs' | 'sm';
    maxChips?: number;
    showAddButton?: boolean;
    isDragOver?: boolean;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (e: React.DragEvent) => void;
    onClick?: () => void;
    actions: DayCellActions;
    className?: string;
}

export function CalendarDayCell({
    date,
    dayNumber,
    dayLabel,
    isToday,
    isCurrentMonth = true,
    data,
    canEdit,
    chipSize = 'sm',
    maxChips,
    showAddButton = true,
    isDragOver = false,
    onDragOver,
    onDragLeave,
    onDrop,
    onClick,
    actions,
    className,
}: CalendarDayCellProps) {
    const hasClosure = !!data?.closure;
    const hasMenu = !!data?.menu;
    const events = data?.events ?? [];

    const allChips: React.ReactNode[] = [];

    // ── Fermeture : fond rouge + icône, pas de chip ───────────────────────────
    if (hasClosure && data?.closure) {
        allChips.push(
            <ContextMenu key="closure">
                <ContextMenuTrigger asChild>
                    <div
                        className={cn(
                            'flex items-center gap-1 rounded-full px-2 py-0.5 cursor-pointer hover:opacity-80 select-none',
                            chipSize === 'xs' ? 'text-[10px]' : 'text-xs',
                        )}
                        style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
                        onClick={canEdit ? () => actions.onEditClosure(data.closure!) : undefined}
                    >
                        <CalendarOff className={cn(chipSize === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3', 'shrink-0')} />
                        <span className="truncate font-medium">
                            {data.closure.reason ?? 'Fermeture'}
                        </span>
                    </div>
                </ContextMenuTrigger>
                {canEdit && (
                    <ContextMenuContent>
                        <ContextMenuItem onClick={() => actions.onEditClosure(data.closure!)}>Modifier</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => actions.onDeleteClosure(data.closure!)}
                        >
                            Supprimer
                        </ContextMenuItem>
                    </ContextMenuContent>
                )}
            </ContextMenu>
        );
    }

    // ── Événements ────────────────────────────────────────────────────────────
    for (const event of events) {
        allChips.push(
            <ContextMenu key={`event-${event.id}`}>
                <ContextMenuTrigger asChild>
                    <div>
                        <EventChip
                            event={event}
                            size={chipSize}
                            onClick={canEdit ? () => actions.onEditEvent(event) : undefined}
                        />
                    </div>
                </ContextMenuTrigger>
                {canEdit && (
                    <ContextMenuContent>
                        <ContextMenuItem onClick={() => actions.onEditEvent(event)}>Modifier</ContextMenuItem>
                        <ContextMenuItem onClick={() => actions.onDuplicateEvent(event)}>Dupliquer</ContextMenuItem>
                        <ContextMenuSeparator />
                        {event.status === 'draft'
                            ? <ContextMenuItem onClick={() => actions.onPublishEvent(event)}>Publier</ContextMenuItem>
                            : <ContextMenuItem onClick={() => actions.onUnpublishEvent(event)}>Repasser en brouillon</ContextMenuItem>
                        }
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => actions.onDeleteEvent(event)}
                        >
                            Supprimer
                        </ContextMenuItem>
                    </ContextMenuContent>
                )}
            </ContextMenu>
        );
    }

    // ── Menu ──────────────────────────────────────────────────────────────────
    if (hasMenu && data?.menu) {
        allChips.push(
            <ContextMenu key="menu">
                <ContextMenuTrigger asChild>
                    <div>
                        <MenuChip
                            menu={data.menu}
                            size={chipSize}
                            draggable={canEdit}
                            onDragStart={() => actions.onMenuDragStart(date, data.menu!)}
                            onClick={canEdit ? () => actions.onEditMenu(data.menu!) : undefined}
                        />
                    </div>
                </ContextMenuTrigger>
                {canEdit && (
                    <ContextMenuContent>
                        <ContextMenuItem onClick={() => actions.onEditMenu(data.menu!)}>Modifier</ContextMenuItem>
                        <ContextMenuSeparator />
                        {data.menu.status === 'draft'
                            ? <ContextMenuItem onClick={() => actions.onPublishMenu(data.menu!)}>Publier</ContextMenuItem>
                            : <ContextMenuItem onClick={() => actions.onUnpublishMenu(data.menu!)}>Repasser en brouillon</ContextMenuItem>
                        }
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => actions.onDeleteMenu(data.menu!)}
                        >
                            Supprimer
                        </ContextMenuItem>
                    </ContextMenuContent>
                )}
            </ContextMenu>
        );
    }

    const visibleChips = maxChips ? allChips.slice(0, maxChips) : allChips;
    const hiddenCount = maxChips ? Math.max(0, allChips.length - maxChips) : 0;

    return (
        <div
            onClick={onClick}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
                'flex flex-col gap-0.5 transition-colors',
                isDragOver && 'ring-2 ring-inset ring-primary bg-primary/5',
                hasClosure && !isDragOver && 'bg-red-50/60 dark:bg-red-950/10',
                !isCurrentMonth && 'opacity-40',
                onClick && 'cursor-pointer',
                className,
            )}
        >
            {/* Numéro du jour */}
            {(dayNumber !== undefined) && (
                <div className="flex items-center gap-1 mb-0.5">
                    {dayLabel && (
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">
                            {dayLabel}
                        </span>
                    )}
                    <span
                        className={cn(
                            'text-sm font-semibold flex items-center justify-center w-6 h-6 rounded-full leading-none',
                            isToday
                                ? 'bg-primary text-white'
                                : isCurrentMonth
                                ? 'text-foreground'
                                : 'text-muted-foreground',
                        )}
                    >
                        {dayNumber}
                    </span>
                </div>
            )}

            {/* Chips */}
            <div className="flex flex-col gap-0.5">
                {visibleChips}
                {hiddenCount > 0 && (
                    <span className="text-[10px] text-muted-foreground pl-1">+{hiddenCount} autre{hiddenCount > 1 ? 's' : ''}</span>
                )}
            </div>

            {/* Bouton + ajouter menu (si aucun menu et pas de fermeture) */}
            {showAddButton && canEdit && !hasMenu && !hasClosure && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); actions.onAddMenu(date); }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors mt-0.5 opacity-0 group-hover:opacity-100 px-1 py-0.5 rounded hover:bg-primary/5"
                >
                    <Plus className="w-2.5 h-2.5" />
                    Menu
                </button>
            )}
        </div>
    );
}
