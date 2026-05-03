import { useState, useCallback, useEffect } from 'react';
import { closuresApi } from '@/lib/api';
import type { ExceptionalClosure } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import type { CalendarData } from '../useCalendarData';
import type { DesktopView, MobileView } from '../CalendarToolbar';
import { ClosureEditor } from '../closure/ClosureEditor';
import { CLOSURE_HATCH_STYLE } from '../closure/closureStyle';
import { DragMode, orderDates } from '../closure/closureDrag';

// ─── Constants ────────────────────────────────────────────────────────────────

const FR_MONTHS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const FR_DAYS_MINI = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOf(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const back = (d.getDay() + 6) % 7;
    return addDays(dateStr, -back);
}

function getMonthGrid(year: number, month: number): string[] {
    const mm = String(month + 1).padStart(2, '0');
    const firstDay = `${year}-${mm}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDay = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
    const gridStart = getMondayOf(firstDay);
    const gridEnd = addDays(getMondayOf(lastDay), 6);
    const days: string[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) { days.push(cursor); cursor = addDays(cursor, 1); }
    return days;
}

function getDragStyle(date: string, drag: DragMode | null): string {
    if (!drag) return '';
    if (drag.kind === 'selecting') {
        const [lo, hi] = orderDates(drag.start, drag.hover);
        if (date >= lo && date <= hi) return 'bg-primary/20 rounded';
    } else {
        const { closure, handle, hover } = drag;
        const newStart = handle === 'start' ? hover : closure.start_date;
        const newEnd = handle === 'end' ? hover : closure.end_date;
        const [lo, hi] = orderDates(newStart, newEnd);
        if (date >= lo && date <= hi) return 'bg-primary/30';
    }
    return '';
}

// ─── Mini-month ───────────────────────────────────────────────────────────────

interface MiniMonthProps {
    year: number;
    month: number;
    today: string;
    data: CalendarData;
    drag: DragMode | null;
    canEdit: boolean;
    onMonthClick: () => void;
    onDayMouseDown: (date: string) => void;
    onDayMouseEnter: (date: string) => void;
}

function MiniMonth({ year, month, today, data, drag, canEdit, onMonthClick, onDayMouseDown, onDayMouseEnter }: MiniMonthProps) {
    const mm = String(month + 1).padStart(2, '0');
    const firstDay = `${year}-${mm}-01`;
    const lastDay = `${year}-${mm}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
    const days = getMonthGrid(year, month);

    return (
        <div className="bg-card rounded-2xl border border-border p-3 select-none">
            <button
                type="button"
                onClick={onMonthClick}
                className="w-full text-left text-xs font-semibold text-foreground mb-2 hover:text-primary transition-colors"
            >
                {FR_MONTHS[month]}
            </button>

            <div className="grid grid-cols-7 mb-1">
                {FR_DAYS_MINI.map((d, i) => (
                    <div key={i} className="text-center text-[9px] font-medium text-muted-foreground">{d}</div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5">
                {days.map(date => {
                    const isCurrentMonth = date >= firstDay && date <= lastDay;
                    const dayNum = parseInt(date.split('-')[2], 10);
                    const isToday = date === today;
                    const closure = data[date]?.closure ?? null;
                    const isClosure = !!closure && isCurrentMonth;
                    const hasEvent = (data[date]?.events?.length ?? 0) > 0 && isCurrentMonth && !isClosure;

                    const dragStyle = getDragStyle(date, drag);
                    const isBoundary = isClosure && canEdit && (date === closure!.start_date || date === closure!.end_date);

                    return (
                        <div
                            key={date}
                            className={cn(
                                'relative flex flex-col items-center justify-center w-full aspect-square cursor-pointer',
                                !isCurrentMonth && 'opacity-25',
                                isBoundary && 'cursor-col-resize',
                                !isClosure && 'rounded-sm',
                                dragStyle,
                                !dragStyle && !isClosure && isToday && 'bg-primary text-white rounded-full font-bold',
                                !dragStyle && !isClosure && !isToday && 'hover:bg-muted rounded-sm',
                            )}
                            style={isClosure && !dragStyle ? CLOSURE_HATCH_STYLE : undefined}
                            onMouseDown={() => isCurrentMonth && onDayMouseDown(date)}
                            onMouseEnter={() => onDayMouseEnter(date)}
                        >
                            <span className={cn('text-[10px]', !dragStyle && !isClosure && isToday && 'font-bold')}>
                                {dayNum}
                            </span>
                            {hasEvent && (
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── YearView ────────────────────────────────────────────────────────────────

interface YearViewProps {
    year: number;
    data: CalendarData;
    canEdit: boolean;
    onNavigate: (view: DesktopView | MobileView, date: string) => void;
    onReload: () => void;
}

export function YearView({ year, data, canEdit, onNavigate, onReload }: YearViewProps) {
    const today = parisToday();
    const months = Array.from({ length: 12 }, (_, i) => i);

    const [drag, setDrag] = useState<DragMode | null>(null);
    const [mouseHasMoved, setMouseHasMoved] = useState(false);
    const [closureEditorOpen, setClosureEditorOpen] = useState(false);
    const [editingClosure, setEditingClosure] = useState<ExceptionalClosure | null>(null);
    const [closurePrefill, setClosurePrefill] = useState<{ start: string; end: string } | null>(null);

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
                    setClosureEditorOpen(true);
                } else {
                    onNavigate('day', drag.start);
                }
            } else if (start === end) {
                onNavigate('day', start);
            } else {
                setEditingClosure(null);
                setClosurePrefill({ start, end });
                setClosureEditorOpen(true);
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
        <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                {months.map(m => (
                    <MiniMonth
                        key={m}
                        year={year}
                        month={m}
                        today={today}
                        data={data}
                        drag={drag}
                        canEdit={canEdit}
                        onMonthClick={() => onNavigate('month', `${year}-${String(m + 1).padStart(2, '0')}-01`)}
                        onDayMouseDown={handleDayMouseDown}
                        onDayMouseEnter={handleDayMouseEnter}
                    />
                ))}
            </div>

            <ClosureEditor
                open={closureEditorOpen}
                closure={editingClosure}
                prefillStart={closurePrefill?.start}
                prefillEnd={closurePrefill?.end}
                onClose={() => { setClosureEditorOpen(false); setEditingClosure(null); setClosurePrefill(null); }}
                onSaved={() => { setClosureEditorOpen(false); setEditingClosure(null); setClosurePrefill(null); onReload(); }}
            />
        </div>
    );
}
