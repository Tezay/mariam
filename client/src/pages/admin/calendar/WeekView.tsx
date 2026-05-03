import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, Save, Undo2 } from 'lucide-react';
import type { MenuCategory } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import type { CalendarData } from './useCalendarData';
import type { DesktopView, MobileView } from './CalendarToolbar';
import { WeekDayColumn } from './week/WeekDayColumn';
import { useSelection } from './selection/useSelection';
import { SelectionToolbar } from './selection/SelectionToolbar';

interface WeekViewProps {
    weekStart: string;
    data: CalendarData;
    canEdit: boolean;
    serviceDays: number[];
    restaurantId: number | undefined;
    categories: MenuCategory[];
    onNavigate: (view: DesktopView | MobileView, date: string) => void;
    onReload: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onEditEvent?: (event: import('@/lib/api').Event) => void;
}

export function WeekView({ weekStart, data, canEdit, serviceDays, restaurantId, categories, onNavigate, onReload, onDirtyChange, onEditEvent }: WeekViewProps) {
    const today = parisToday();
    const selection = useSelection();

    // Dirty state: track which columns are dirty and their save/reset callbacks
    const saveCallbacksRef = useRef<Record<string, { save: () => Promise<void>; reset: () => void }>>({});
    const [dirtyDates, setDirtyDates] = useState<Set<string>>(new Set());
    const [isSavingAll, setIsSavingAll] = useState(false);

    const anyDirty = dirtyDates.size > 0;

    useEffect(() => {
        onDirtyChange?.(anyDirty);
    }, [anyDirty, onDirtyChange]);

    const handleColumnDirtyChange = useCallback((date: string, dirty: boolean, save: () => Promise<void>, reset: () => void) => {
        if (dirty) {
            saveCallbacksRef.current[date] = { save, reset };
        } else {
            delete saveCallbacksRef.current[date];
        }
        setDirtyDates(prev => {
            const next = new Set(prev);
            if (dirty) next.add(date); else next.delete(date);
            return next;
        });
    }, []);

    const handleSaveAll = useCallback(async () => {
        setIsSavingAll(true);
        try {
            await Promise.all(Object.values(saveCallbacksRef.current).map(({ save }) => save()));
        } finally {
            setIsSavingAll(false);
        }
    }, []);

    const handleResetAll = useCallback(() => {
        Object.values(saveCallbacksRef.current).forEach(({ reset }) => reset());
    }, []);


    // Build 7 days and filter to service days only
    const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const serviceDaySet = new Set(serviceDays);

    const visibleDays = allDays.filter((date) => {
        const d = new Date(date + 'T12:00:00');
        const mariamDay = (d.getDay() + 6) % 7; // 0=Mon…6=Sun
        return serviceDaySet.has(mariamDay);
    });

    // Collect selected items for SelectionToolbar
    const selectedItems = selection.selection
        .filter(e => e.type === 'item')
        .map(e => {
            if (e.type !== 'item') return null;
            const dayData = data[e.date];
            return (dayData?.menu?.items ?? []).find(i => i.id === e.itemId) ?? null;
        })
        .filter((i): i is NonNullable<typeof i> => i !== null);

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Selection mode toggle */}
            {canEdit && (
                <div className="flex items-center justify-end px-4 py-1.5 border-b border-border bg-card shrink-0">
                    <button
                        type="button"
                        onClick={selection.toggleSelectionMode}
                        className={cn(
                            'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors',
                            selection.selectionMode
                                ? 'bg-primary text-white'
                                : 'text-muted-foreground hover:bg-muted',
                        )}
                    >
                        <CheckSquare className="w-3.5 h-3.5" />
                        {selection.selectionMode ? 'Sélection active' : 'Sélectionner'}
                    </button>
                </div>
            )}

            {/* Week columns */}
            <div className="flex flex-1 overflow-x-auto border-t border-border">
                {visibleDays.map(date => (
                    <WeekDayColumn
                        key={date}
                        date={date}
                        isToday={date === today}
                        dayData={data[date]}
                        restaurantId={restaurantId}
                        canEdit={canEdit}
                        categories={categories}
                        selection={selection}
                        onNavigateDay={d => onNavigate('day', d)}
                        onReload={onReload}
                        onDirtyChange={handleColumnDirtyChange}
                        onEditEvent={onEditEvent}
                    />
                ))}
                {visibleDays.length === 0 && (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <p className="text-sm text-muted-foreground">Aucun jour de service configuré.</p>
                    </div>
                )}
            </div>

            {/* Selection toolbar */}
            <SelectionToolbar
                selection={selection}
                selectedItems={selectedItems}
                onClearAndReload={() => { selection.clearSelection(); onReload(); }}
            />

            {/* Fixed save bar — above mobile nav (bottom-16), shown when any column is dirty */}
            {anyDirty && canEdit && (
                <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-card border border-border rounded-2xl shadow-lg px-4 py-2.5 whitespace-nowrap">
                    <span className="text-xs text-muted-foreground">
                        {dirtyDates.size === 1 ? '1 jour modifié' : `${dirtyDates.size} jours modifiés`}
                    </span>
                    <button
                        type="button"
                        onClick={handleResetAll}
                        disabled={isSavingAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        <Undo2 className="w-3.5 h-3.5" />
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={isSavingAll}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {isSavingAll ? 'Enregistrement…' : 'Tout sauvegarder'}
                    </button>
                </div>
            )}
        </div>
    );
}
