import { useEffect, useRef, useState } from 'react';
import { CalendarOff, Pencil } from 'lucide-react';
import type { Event, MenuCategory, MenuItem } from '@/lib/api';
import type { DayData } from '../useCalendarData';
import { EventCard } from '../EventCard';
import { useMenuEditor } from '../day/useMenuEditor';
import { WeekCategoryBox } from './WeekCategoryBox';
import { AddMenuCTA } from './AddMenuCTA';
import { cn } from '@/lib/utils';
import type { UseSelectionReturn } from '../selection/useSelection';
import { CLOSURE_HATCH_STYLE } from '../closure/closureStyle';
import { ClosureEditor } from '../closure/ClosureEditor';

const FR_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getDayOfWeekLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return FR_DAYS[(d.getDay() + 6) % 7];
}

interface WeekDayColumnProps {
    date: string;
    isToday: boolean;
    dayData: DayData | undefined;
    restaurantId: number | undefined;
    canEdit: boolean;
    categories: MenuCategory[];
    selection: UseSelectionReturn;
    onNavigateDay: (date: string) => void;
    onReload: () => void;
    onDirtyChange: (date: string, dirty: boolean, save: () => Promise<void>, reset: () => void) => void;
    onEditEvent?: (event: Event) => void;
}

export function WeekDayColumn({
    date,
    isToday,
    dayData,
    restaurantId,
    canEdit,
    categories,
    selection,
    onNavigateDay,
    onReload,
    onDirtyChange,
    onEditEvent,
}: WeekDayColumnProps) {
    const dayNum = parseInt(date.split('-')[2], 10);
    const closure = dayData?.closure ?? null;
    const menu = dayData?.menu ?? null;
    const [closureEditorOpen, setClosureEditorOpen] = useState(false);

    const editor = useMenuEditor({ date, menu, restaurantId });

    // Keep latest save/reset in refs so the effect closure stays stable
    const saveRef = useRef(editor.save);
    const resetRef = useRef(editor.reset);
    useEffect(() => { saveRef.current = editor.save; }, [editor.save]);
    useEffect(() => { resetRef.current = editor.reset; }, [editor.reset]);

    useEffect(() => {
        onDirtyChange(date, editor.isDirty, () => saveRef.current(), () => resetRef.current());
    }, [editor.isDirty, date, onDirtyChange]);

    const categoriesWithItems = categories
        .filter(cat => cat.parent_id === null)
        .map(cat => {
            const subIds = new Set(
                (cat.subcategories ?? []).map(s => s.id).concat([cat.id])
            );
            return {
                category: cat,
                items: editor.items.filter(item => subIds.has(item.category_id)),
            };
        })
        .filter(({ items }) => items.length > 0);

    const isSelected = (itemId: number) =>
        selection.isSelected({ type: 'item', itemId, date, categoryId: 0 });

    const toggleItem = (item: MenuItem) =>
        selection.toggleItem({ type: 'item', itemId: item.id!, date, categoryId: item.category_id });

    return (
        <div
            className={cn(
                'flex flex-col border-r border-border min-w-[200px] flex-1',
                isToday && !closure && 'bg-primary/5',
            )}
            style={closure ? CLOSURE_HATCH_STYLE : undefined}
        >
            {/* Header */}
            <div className={cn(
                'relative px-2 py-2.5 text-center border-b border-border',
                closure ? 'bg-white/60' : 'bg-card',
                isToday && !closure && 'bg-primary/5',
            )}>
                <p className={cn(
                    'text-[10px] font-semibold uppercase tracking-wide',
                    closure ? 'text-gray-400' : 'text-muted-foreground',
                )}>
                    {getDayOfWeekLabel(date)}
                </p>
                <p className={cn(
                    'text-lg font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full mx-auto',
                    isToday && !closure ? 'bg-primary text-white' : closure ? 'text-gray-400' : 'text-foreground',
                )}>
                    {dayNum}
                </p>
                {canEdit && editor.menuStatus !== null && !closure && (
                    <button
                        type="button"
                        onClick={editor.menuStatus === 'published' ? editor.unpublishMenu : editor.publishMenu}
                        disabled={editor.isPublishing}
                        className={cn(
                            'absolute top-1.5 right-1 text-[9px] font-semibold rounded-full px-1.5 py-0.5 border transition-colors',
                            editor.menuStatus === 'published'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
                        )}
                    >
                        {editor.isPublishing ? '…' : editor.menuStatus === 'published' ? 'Publié' : 'Brouillon'}
                    </button>
                )}
            </div>

            {/* Body */}
            {closure ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center bg-white/40">
                    <CalendarOff className="w-8 h-8 text-gray-400" />
                    <p className="text-xs text-gray-600 font-medium leading-snug">
                        {closure.reason ?? 'Fermeture exceptionnelle'}
                    </p>
                    {closure.description && (
                        <p className="text-[10px] text-gray-500 leading-snug">{closure.description}</p>
                    )}
                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => setClosureEditorOpen(true)}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 bg-white rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                            <Pencil className="w-3 h-3" />
                            Modifier
                        </button>
                    )}
                    {canEdit && (
                        <ClosureEditor
                            open={closureEditorOpen}
                            closure={closure}
                            onClose={() => setClosureEditorOpen(false)}
                            onSaved={() => { setClosureEditorOpen(false); onReload(); }}
                        />
                    )}
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {(dayData?.events ?? []).map(event => (
                        <EventCard key={event.id} event={event} compact onEdit={onEditEvent} />
                    ))}
                    {categoriesWithItems.length > 0 ? (
                        categoriesWithItems.map(({ category, items }) => (
                            <WeekCategoryBox
                                key={category.id}
                                category={category}
                                items={items}
                                editor={editor}
                                canEdit={canEdit}
                                selectionMode={selection.selectionMode}
                                isSelected={isSelected}
                                onToggleItem={toggleItem}
                                date={date}
                            />
                        ))
                    ) : (
                        canEdit
                            ? <AddMenuCTA onAdd={() => onNavigateDay(date)} />
                            : <p className="text-xs text-muted-foreground text-center py-4">Pas de menu</p>
                    )}
                </div>
            )}
        </div>
    );
}
