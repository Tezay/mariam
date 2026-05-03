import { useEffect, useState } from 'react';
import { CalendarOff, Pencil } from 'lucide-react';
import type { Event, MenuCategory } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { AdminDayDisplay } from './day/AdminDayDisplay';
import type { CalendarData } from './useCalendarData';
import type { ExceptionalClosure } from '@/lib/api';
import { CLOSURE_HATCH_STYLE } from './closure/closureStyle';
import { ClosureEditor } from './closure/ClosureEditor';

const FR_DAYS_SHORT = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const FR_DAYS_LONG  = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatClosureRange(start: string, end: string): string {
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return start === end ? `Le ${fmt(start)}` : `Du ${fmt(start)} au ${fmt(end)}`;
}

function getMondayOfWeek(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const back = (d.getDay() + 6) % 7;
    return addDays(dateStr, -back);
}

// ─── ClosureScreen ────────────────────────────────────────────────────────────

interface ClosureScreenProps {
    closure: ExceptionalClosure;
    canEdit: boolean;
    onReload: () => void;
}

function ClosureScreen({ closure, canEdit, onReload }: ClosureScreenProps) {
    const [editorOpen, setEditorOpen] = useState(false);
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center" style={CLOSURE_HATCH_STYLE}>
            <div className="w-20 h-20 rounded-full bg-white/80 shadow-sm flex items-center justify-center">
                <CalendarOff className="w-10 h-10 text-gray-400" />
            </div>
            <div className="bg-white/80 rounded-2xl px-6 py-4 shadow-sm max-w-sm space-y-1">
                <p className="text-base font-bold text-gray-800">Fermeture exceptionnelle</p>
                {closure.reason && <p className="text-sm text-gray-600">{closure.reason}</p>}
                {closure.description && <p className="text-xs text-gray-500">{closure.description}</p>}
                <p className="text-xs text-gray-400 pt-1">{formatClosureRange(closure.start_date, closure.end_date)}</p>
            </div>
            {canEdit && (
                <Button variant="outline" onClick={() => setEditorOpen(true)} className="gap-2 rounded-xl bg-white">
                    <Pencil className="w-4 h-4" />
                    Modifier la fermeture
                </Button>
            )}
            <ClosureEditor
                open={editorOpen}
                closure={closure}
                onClose={() => setEditorOpen(false)}
                onSaved={() => { setEditorOpen(false); onReload(); }}
            />
        </div>
    );
}

// ─── DayDot ───────────────────────────────────────────────────────────────────

function DayDot({ dayData }: { dayData?: CalendarData[string] }) {
    const hasClosure = !!dayData?.closure;
    const hasMenu = !!dayData?.menu;
    const hasEvent = (dayData?.events?.length ?? 0) > 0;
    if (!hasClosure && !hasMenu && !hasEvent) return null;
    return (
        <div className="flex gap-0.5 justify-center mt-0.5">
            {hasClosure && <span className="w-1 h-1 rounded-full bg-gray-400" />}
            {hasEvent && <span className="w-1 h-1 rounded-full bg-emerald-400" />}
            {hasMenu && <span className="w-1 h-1 rounded-full bg-[#093EAA]" />}
        </div>
    );
}

// ─── DayView ─────────────────────────────────────────────────────────────────

interface DayViewProps {
    selectedDate: string;
    data: CalendarData;
    canEdit: boolean;
    restaurantId: number | undefined;
    serviceDays: number[];
    categories: MenuCategory[];
    onDateChange: (date: string) => void;
    onReload: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onEditEvent?: (event: Event) => void;
    onStartOnboarding?: (date: string) => void;
}

export function DayView({ selectedDate, data, canEdit, restaurantId, serviceDays, categories, onDateChange, onReload, onDirtyChange, onEditEvent, onStartOnboarding }: DayViewProps) {
    const today = parisToday();
    const weekStart = getMondayOfWeek(selectedDate);
    const serviceDaySet = new Set(serviceDays);

    const [weekOffset, setWeekOffset] = useState(0);
    const [animKey, setAnimKey] = useState(0);
    const [editorDirty, setEditorDirty] = useState(false);
    const [pendingDate, setPendingDate] = useState<string | null>(null);

    useEffect(() => {
        onDirtyChange?.(editorDirty);
    }, [editorDirty, onDirtyChange]);

    const currentWeekStart = addDays(weekStart, weekOffset * 7);

    // Only show service days in the strip
    const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
    const currentWeekDays = allWeekDays.filter(date => {
        const mariamDay = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
        return serviceDaySet.has(mariamDay);
    });

    const prevWeek = () => setWeekOffset(o => o - 1);
    const nextWeek = () => setWeekOffset(o => o + 1);

    const handleDateChange = (date: string) => {
        if (editorDirty) {
            setPendingDate(date);
            return;
        }
        onDateChange(date);
        setAnimKey(k => k + 1);
    };

    const confirmNavigation = () => {
        if (!pendingDate) return;
        onDateChange(pendingDate);
        setPendingDate(null);
        setAnimKey(k => k + 1);
    };

    const dayData = data[selectedDate];
    const closure = dayData?.closure ?? null;

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* ─── Week strip ─── */}
            <div className="bg-card border-b border-border px-2 py-2 shrink-0">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={prevWeek}
                        className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
                        aria-label="Semaine précédente"
                    >
                        ‹
                    </button>

                    <div className="flex-1 relative flex p-0.5">
                        {/* Animated selection pill (non-closure days only) */}
                        {(() => {
                            const selectedIdx = currentWeekDays.indexOf(selectedDate);
                            const isSelectedClosure = !!data[selectedDate]?.closure;
                            const n = currentWeekDays.length;
                            if (selectedIdx < 0 || isSelectedClosure || n === 0) return null;
                            return (
                                <span
                                    aria-hidden
                                    className="absolute top-0.5 bottom-0.5 rounded-xl bg-primary/10 pointer-events-none"
                                    style={{
                                        width: `calc(${100 / n}% - 1px)`,
                                        left: '1px',
                                        transform: `translateX(calc(${selectedIdx} * 100% + ${selectedIdx}px))`,
                                        transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                                    }}
                                />
                            );
                        })()}
                        {currentWeekDays.map((date) => {
                            const dayNum = parseInt(date.split('-')[2], 10);
                            const mariamDay = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
                            const isToday = date === today;
                            const isSelected = date === selectedDate;
                            const isClosure = !!data[date]?.closure;

                            return (
                                <button
                                    key={date}
                                    type="button"
                                    onClick={() => { handleDateChange(date); setWeekOffset(0); }}
                                    className={cn(
                                        'relative z-10 flex flex-col items-center py-1.5 flex-1 transition-colors rounded-xl',
                                        isClosure && !isSelected && 'opacity-70',
                                        isClosure && isSelected && 'ring-2 ring-inset ring-border',
                                        !isClosure && isSelected && 'ring-2 ring-inset ring-primary',
                                        !isClosure && !isSelected && 'hover:bg-muted',
                                    )}
                                    style={isClosure ? CLOSURE_HATCH_STYLE : undefined}
                                >
                                    {/* Short label on mobile, full name on md+ */}
                                    <span className={cn(
                                        'text-[10px] font-semibold uppercase md:hidden',
                                        isClosure ? 'text-foreground/50' : 'text-muted-foreground',
                                    )}>
                                        {FR_DAYS_SHORT[mariamDay]}
                                    </span>
                                    <span className={cn(
                                        'hidden md:block text-xs font-semibold capitalize',
                                        isClosure ? 'text-foreground/50' : 'text-muted-foreground',
                                    )}>
                                        {FR_DAYS_LONG[mariamDay]}
                                    </span>

                                    {/* Day number */}
                                    <span className={cn(
                                        'text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mt-0.5',
                                        isClosure ? 'text-foreground/50' : '',
                                        isToday && !isSelected && !isClosure && 'bg-primary text-white',
                                        isSelected && !isClosure && 'text-primary',
                                        !isToday && !isSelected && !isClosure && 'text-foreground',
                                    )}>
                                        {dayNum}
                                    </span>

                                    <DayDot dayData={data[date]} />
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={nextWeek}
                        className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
                        aria-label="Semaine suivante"
                    >
                        ›
                    </button>
                </div>
            </div>

            {/* ─── Day content ─── */}
            {closure ? (
                <ClosureScreen closure={closure} canEdit={canEdit} onReload={onReload} />
            ) : (
                <div key={animKey} className="flex flex-col flex-1 overflow-hidden animate-in fade-in duration-150">
                    <AdminDayDisplay
                        date={selectedDate}
                        menu={dayData?.menu ?? null}
                        restaurantId={restaurantId}
                        canEdit={canEdit}
                        categories={categories}
                        events={dayData?.events ?? []}
                        onEditEvent={onEditEvent}
                        onReload={onReload}
                        onDirtyChange={setEditorDirty}
                        onStartOnboarding={onStartOnboarding}
                    />
                </div>
            )}

            {/* ─── Dirty guard dialog ─── */}
            <AlertDialog open={pendingDate !== null} onOpenChange={open => { if (!open) setPendingDate(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Modifications non sauvegardées</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous avez des modifications non enregistrées sur ce menu. Si vous changez de jour, elles seront perdues.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingDate(null)}>
                            Annuler
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmNavigation}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Continuer sans sauvegarder
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
