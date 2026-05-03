import { useCallback, useEffect, useState } from 'react';
import { closuresApi } from '@/lib/api';
import type { Event, ExceptionalClosure, MenuCategory, MenuItem } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { getCategoryColor, HIGHLIGHTED_COLOR } from '@/lib/category-colors';
import type { CalendarData } from './useCalendarData';
import type { DesktopView, MobileView } from './CalendarToolbar';
import { CLOSURE_HATCH_STYLE } from './closure/closureStyle';
import { DragMode, orderDates } from './closure/closureDrag';
import { ClosureEditor } from './closure/ClosureEditor';

const FR_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeekContaining(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const back = (d.getDay() + 6) % 7;
    const m = new Date(d);
    m.setDate(d.getDate() - back);
    return m.toISOString().split('T')[0];
}

function groupItemsByCategory(
    items: MenuItem[],
    categories: MenuCategory[],
): Array<{ category: MenuCategory; items: MenuItem[] }> {
    const map = new Map<number, { category: MenuCategory; items: MenuItem[] }>();
    for (const cat of categories) {
        map.set(cat.id, { category: cat, items: [] });
    }
    for (const item of items) {
        const entry = map.get(item.category_id);
        if (entry) entry.items.push(item);
    }
    return Array.from(map.values()).filter(e => e.items.length > 0);
}

function getDragPreviewStyle(date: string, drag: DragMode | null): string {
    if (!drag) return '';
    if (drag.kind === 'selecting') {
        const [lo, hi] = orderDates(drag.start, drag.hover);
        if (date >= lo && date <= hi) return 'bg-primary/20';
    } else {
        const { closure, handle, hover } = drag;
        const newStart = handle === 'start' ? hover : closure.start_date;
        const newEnd = handle === 'end' ? hover : closure.end_date;
        const [lo, hi] = orderDates(newStart, newEnd);
        if (date >= lo && date <= hi) return 'bg-primary/30';
    }
    return '';
}

// ─── CompactCategoryBox ───────────────────────────────────────────────────────

function CompactCategoryBox({ category, items }: { category: MenuCategory; items: MenuItem[] }) {
    const color = category.is_highlighted ? HIGHLIGHTED_COLOR : getCategoryColor(category.color_key, category.order);
    return (
        <div
            className="rounded-xl px-1.5 pt-1 pb-1.5 mb-0.5 last:mb-0"
            style={{ backgroundColor: color.bg, borderBottom: `3px solid ${color.border}` }}
        >
            <p className="text-[8px] font-bold uppercase tracking-wide text-center mb-0.5 truncate"
               style={{ color: color.label + 'CC' }}>
                {category.label}
            </p>
            {items.slice(0, 3).map((item, i) => (
                <p key={i} className="text-[9px] truncate leading-tight" style={{ color: color.label }}>
                    {item.name}
                </p>
            ))}
            {items.length > 3 && (
                <p className="text-[8px]" style={{ color: color.label + '99' }}>+{items.length - 3}</p>
            )}
        </div>
    );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

interface MonthViewProps {
    year: number;
    month: number;
    data: CalendarData;
    canEdit: boolean;
    serviceDays: number[];
    categories: MenuCategory[];
    onNavigate: (view: DesktopView | MobileView, date: string) => void;
    onReload: () => void;
    onEditEvent?: (event: Event) => void;
}

export function MonthView({ year, month, data, canEdit, serviceDays, categories, onNavigate, onReload, onEditEvent }: MonthViewProps) {
    const today = parisToday();

    const [drag, setDrag] = useState<DragMode | null>(null);
    const [mouseHasMoved, setMouseHasMoved] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingClosure, setEditingClosure] = useState<ExceptionalClosure | null>(null);
    const [closurePrefill, setClosurePrefill] = useState<{ start: string; end: string } | null>(null);

    const mm = String(month + 1).padStart(2, '0');
    const firstDay = `${year}-${mm}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDay = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;

    const gridStart = getMondayOfWeekContaining(firstDay);
    const gridEnd = addDays(getMondayOfWeekContaining(lastDay), 6);

    const gridDays: string[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) { gridDays.push(cursor); cursor = addDays(cursor, 1); }

    const serviceColIndices = new Set(serviceDays);

    // ─── Drag handlers ────────────────────────────────────────────────────────

    const handleDayMouseDown = useCallback((date: string) => {
        if (!canEdit) return;
        const closure = data[date]?.closure ?? null;
        setMouseHasMoved(false);
        if (closure) {
            const handle = date === closure.start_date ? 'start'
                : date === closure.end_date ? 'end'
                : null;
            if (handle) {
                setDrag({ kind: 'handle', closure, handle, hover: date });
                return;
            }
        }
        setDrag({ kind: 'selecting', start: date, hover: date });
    }, [canEdit, data]);

    const handleDayMouseEnter = useCallback((date: string) => {
        setDrag(prev => {
            if (!prev) return prev;
            if (prev.hover !== date) setMouseHasMoved(true);
            return { ...prev, hover: date };
        });
    }, []);

    const handleMouseUp = useCallback(async () => {
        if (!drag) return;

        if (drag.kind === 'selecting') {
            const [start, end] = orderDates(drag.start, drag.hover);
            setDrag(null);
            if (!mouseHasMoved) {
                // Simple click
                const closure = data[drag.start]?.closure ?? null;
                if (closure && canEdit) {
                    setEditingClosure(closure);
                    setClosurePrefill(null);
                    setEditorOpen(true);
                } else {
                    onNavigate('day', drag.start);
                }
            } else if (start === end) {
                onNavigate('day', start);
            } else {
                setEditingClosure(null);
                setClosurePrefill({ start, end });
                setEditorOpen(true);
            }
        } else {
            const { closure, handle, hover } = drag;
            setDrag(null);
            if (hover === (handle === 'start' ? closure.start_date : closure.end_date)) return;
            const newStart = handle === 'start' ? hover : closure.start_date;
            const newEnd = handle === 'end' ? hover : closure.end_date;
            const [lo, hi] = orderDates(newStart, newEnd);
            try {
                await closuresApi.update(closure.id, { start_date: lo, end_date: hi });
                onReload();
            } catch { /* ignore */ }
        }
    }, [drag, mouseHasMoved, data, canEdit, onNavigate, onReload]);

    useEffect(() => {
        const up = () => { if (drag) handleMouseUp(); };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, [drag, handleMouseUp]);

    return (
        <div className="flex-1 overflow-auto">
            <div className="min-w-[500px]">
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 border-l border-t border-border">
                    {FR_DAYS_SHORT.map((d, i) => (
                        <div
                            key={d}
                            className={cn(
                                'py-2 text-center text-xs font-semibold uppercase tracking-wide border-r border-b border-border',
                                serviceColIndices.has(i) ? 'text-muted-foreground' : 'text-muted-foreground/30 bg-muted/20',
                            )}
                        >
                            {d}
                        </div>
                    ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 border-l border-border">
                    {gridDays.map((date, idx) => {
                        const colIdx = idx % 7;
                        const isServiceDay = serviceColIndices.has(colIdx);
                        const isCurrentMonth = date >= firstDay && date <= lastDay;
                        const isToday = date === today;
                        const dayNum = parseInt(date.split('-')[2], 10);
                        const dayData = data[date];
                        const closure = dayData?.closure ?? null;
                        const isClosureDay = !!closure && isCurrentMonth;

                        // Horizontal joining: hide right border between consecutive closure cells in same row
                        const nextDate = addDays(date, 1);
                        const nextHasClosure = isClosureDay && !!data[nextDate]?.closure && colIdx < 6;

                        const menu = dayData?.menu ?? null;
                        const groups = menu && categories.length > 0
                            ? groupItemsByCategory(menu.items ?? [], categories)
                            : [];

                        const dragStyle = getDragPreviewStyle(date, drag);

                        // Cursor logic
                        const isBoundary = isClosureDay && canEdit && (date === closure!.start_date || date === closure!.end_date);
                        const cursorClass = isBoundary ? 'cursor-col-resize'
                            : isClosureDay && canEdit ? 'cursor-pointer'
                            : isClosureDay ? ''
                            : isCurrentMonth && isServiceDay ? 'cursor-pointer'
                            : '';

                        return (
                            <div
                                key={date}
                                className={cn(
                                    'relative border-b min-h-[80px] p-1 flex flex-col transition-colors select-none',
                                    nextHasClosure ? 'border-r border-r-transparent' : 'border-r border-border',
                                    !isCurrentMonth && 'bg-muted/20',
                                    !isServiceDay && isCurrentMonth && !isClosureDay && 'bg-muted/10',
                                    dragStyle && dragStyle,
                                    cursorClass,
                                )}
                                style={isClosureDay && !dragStyle ? CLOSURE_HATCH_STYLE : undefined}
                                onMouseDown={() => isCurrentMonth && handleDayMouseDown(date)}
                                onMouseEnter={() => handleDayMouseEnter(date)}
                            >
                                {/* Day number */}
                                <div className="flex items-center justify-end mb-1">
                                    <span className={cn(
                                        'text-xs font-semibold w-5 h-5 flex items-center justify-center rounded-full',
                                        isToday && !isClosureDay ? 'bg-primary text-white' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                                        !isServiceDay && isCurrentMonth && 'opacity-40',
                                        isClosureDay && 'bg-white/70',
                                    )}>
                                        {dayNum}
                                    </span>
                                </div>

                                {/* Closure label on first day */}
                                {isClosureDay && closure!.start_date === date && (
                                    <div className="absolute inset-0 flex flex-col items-start justify-end p-1 pointer-events-none">
                                        <span className="text-[9px] font-semibold text-gray-500 bg-white/70 rounded px-1 truncate max-w-full">
                                            {closure!.reason ?? 'Fermé'}
                                        </span>
                                    </div>
                                )}

                                {/* Events */}
                                {!isClosureDay && isCurrentMonth && (dayData?.events ?? []).map(event => (
                                    <button
                                        key={event.id}
                                        type="button"
                                        onClick={() => onEditEvent?.(event)}
                                        className="w-full text-left mb-0.5 px-0.5"
                                    >
                                        <p className="text-[9px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-1 py-0.5 truncate">
                                            {event.title}
                                        </p>
                                    </button>
                                ))}

                                {/* Category boxes */}
                                {!isClosureDay && isServiceDay && isCurrentMonth && groups.length > 0 && (
                                    <div className="flex-1 overflow-hidden mt-0.5">
                                        {groups.slice(0, 3).map(({ category, items }) => (
                                            <CompactCategoryBox key={category.id} category={category} items={items} />
                                        ))}
                                        {groups.length > 3 && (
                                            <p className="text-[9px] text-muted-foreground px-1">
                                                +{groups.length - 3} catégories
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Empty service day hint */}
                                {!isClosureDay && isServiceDay && isCurrentMonth && !menu && canEdit && (
                                    <div className="flex-1 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                        <span className="text-[9px] text-muted-foreground">+</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <ClosureEditor
                open={editorOpen}
                closure={editingClosure}
                prefillStart={closurePrefill?.start}
                prefillEnd={closurePrefill?.end}
                onClose={() => { setEditorOpen(false); setEditingClosure(null); setClosurePrefill(null); }}
                onSaved={() => { setEditorOpen(false); setEditingClosure(null); setClosurePrefill(null); onReload(); }}
            />
        </div>
    );
}
