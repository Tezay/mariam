import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, parisToday } from '@/lib/date-utils';
import { categoriesApi, ExceptionalClosure, Event } from '@/lib/api';
import type { MenuCategory } from '@/lib/api';
import { EventEditor } from '@/components/EventEditor';
import { InlineError, getErrorType } from '@/components/InlineError';
import { CalendarToolbar, DesktopView, MobileView } from './CalendarToolbar';
import { MenuOnboarding } from './day/MenuOnboarding';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { DayView } from './DayView';
import { useCalendarData } from './useCalendarData';
import { ClosureEditor } from './closure/ClosureEditor';
import { YearView } from './views/YearView';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay();
    const back = (day + 6) % 7;
    return addDays(dateStr, -back);
}

function getMonthRange(year: number, month: number): [string, string] {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return [start, end];
}

function getYearRange(year: number): [string, string] {
    return [`${year}-01-01`, `${year}-12-31`];
}

const FR_MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const FR_MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function formatWeekLabel(monday: string): string {
    const sunday = addDays(monday, 6);
    const m = new Date(monday + 'T12:00:00');
    const s = new Date(sunday + 'T12:00:00');
    if (m.getMonth() === s.getMonth()) {
        return `${m.getDate()} – ${s.getDate()} ${FR_MONTHS_LONG[m.getMonth()]} ${m.getFullYear()}`;
    }
    return `${m.getDate()} ${FR_MONTHS_SHORT[m.getMonth()]} – ${s.getDate()} ${FR_MONTHS_SHORT[s.getMonth()]} ${s.getFullYear()}`;
}

function formatMonthLabel(year: number, month: number): string {
    return `${FR_MONTHS_LONG[month]} ${year}`;
}

function formatDayLabel(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
}


// ─── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
    const { user } = useAuth();
    const canEdit = user?.role === 'admin' || user?.role === 'editor';
    const today = parisToday();

    // ── Navigation bounds (±5 ans passé, +2 ans futur) ──
    const todayYear = new Date(today + 'T12:00:00').getFullYear();
    const navMinDate = `${todayYear - 5}-01-01`;
    const navMaxDate = `${todayYear + 2}-12-31`;

    // ── Navigation state ──
    const [desktopView, setDesktopView] = useState<DesktopView>('week');
    const [mobileView, setMobileView] = useState<MobileView>('day');
    const [centerDate, setCenterDate] = useState(today);

    // ── Catégories ──
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    useEffect(() => {
        categoriesApi.list().then(({ categories: cats }) => {
            const flat: MenuCategory[] = [];
            for (const cat of cats) {
                flat.push(cat);
                for (const sub of cat.subcategories ?? []) flat.push(sub);
            }
            setCategories(flat);
        }).catch(() => {});
    }, []);

    // ── Dirty guard ──
    const [editorDirty, setEditorDirty] = useState(false);
    const [dirtyGuardAction, setDirtyGuardAction] = useState<{ fn: () => void } | null>(null);

    const guardedAction = useCallback((fn: () => void) => {
        if (editorDirty) {
            setDirtyGuardAction({ fn });
        } else {
            fn();
        }
    }, [editorDirty]);

    useEffect(() => {
        if (!editorDirty) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [editorDirty]);

    const isGuardDialogOpen = dirtyGuardAction !== null;

    const handleGuardConfirm = useCallback(() => {
        if (dirtyGuardAction) {
            dirtyGuardAction.fn();
            setDirtyGuardAction(null);
        }
    }, [dirtyGuardAction]);

    const handleGuardCancel = useCallback(() => {
        setDirtyGuardAction(null);
    }, []);

    // ── Inter-view navigation ──
    const handleNavigate = useCallback((view: DesktopView | MobileView, date: string) => {
        guardedAction(() => {
            setCenterDate(date);
            if (view === 'day' || view === 'week' || view === 'month' || view === 'year') {
                setDesktopView(view as DesktopView);
            }
        });
    }, [guardedAction]);

    // ── Derived range for data hook ──
    const d = new Date(centerDate + 'T12:00:00');
    const curYear = d.getFullYear();
    const curMonth = d.getMonth();

    const [rangeStart, rangeEnd] = useMemo(() => {
        if (desktopView === 'week') {
            const monday = getMondayOfWeek(centerDate);
            return [monday, addDays(monday, 6)] as [string, string];
        }
        if (desktopView === 'day') {
            return [centerDate, centerDate] as [string, string];
        }
        if (desktopView === 'year') {
            return getYearRange(curYear);
        }
        return getMonthRange(curYear, curMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desktopView, centerDate]);

    const { data, isLoading, error, reload, restaurantId, serviceDays, storageConfigured } = useCalendarData(rangeStart, rangeEnd);

    // ── Auto-select next service day on first load ──
    const hasAutoSelectedRef = useRef(false);
    useEffect(() => {
        if (hasAutoSelectedRef.current || serviceDays.length === 0) return;
        const serviceDaySet = new Set(serviceDays);
        const todayDow = (new Date(today + 'T12:00:00').getDay() + 6) % 7;
        if (serviceDaySet.has(todayDow)) {
            hasAutoSelectedRef.current = true;
            return;
        }
        // Advance to next service day (look up to 7 days ahead)
        for (let i = 1; i <= 7; i++) {
            const candidate = addDays(today, i);
            const candidateDow = (new Date(candidate + 'T12:00:00').getDay() + 6) % 7;
            if (serviceDaySet.has(candidateDow)) {
                setCenterDate(candidate);
                hasAutoSelectedRef.current = true;
                return;
            }
        }
        hasAutoSelectedRef.current = true;
    }, [serviceDays, today]);

    // ── Toolbar label ──
    const toolbarLabel = useMemo(() => {
        if (desktopView === 'week') return formatWeekLabel(getMondayOfWeek(centerDate));
        if (desktopView === 'day') return formatDayLabel(centerDate);
        if (desktopView === 'year') return String(curYear);
        return formatMonthLabel(curYear, curMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desktopView, centerDate]);

    // ── Navigation bounds check ──
    const canGoPrev = useMemo(() => {
        if (desktopView === 'day') return centerDate > navMinDate;
        if (desktopView === 'week') return getMondayOfWeek(centerDate) > navMinDate;
        if (desktopView === 'month') return `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01` > navMinDate;
        return curYear > new Date(navMinDate + 'T12:00:00').getFullYear();
    }, [desktopView, centerDate, curYear, curMonth, navMinDate]);

    const canGoNext = useMemo(() => {
        if (desktopView === 'day') return centerDate < navMaxDate;
        if (desktopView === 'week') return addDays(getMondayOfWeek(centerDate), 6) < navMaxDate;
        if (desktopView === 'month') return `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01` < navMaxDate;
        return curYear < new Date(navMaxDate + 'T12:00:00').getFullYear();
    }, [desktopView, centerDate, curYear, curMonth, navMaxDate]);

    // ── Navigation ──
    const handlePrev = useCallback(() => {
        if (!canGoPrev) return;
        guardedAction(() => {
            if (desktopView === 'day') {
                setCenterDate(prev => addDays(prev, -1));
            } else if (desktopView === 'week') {
                setCenterDate(prev => addDays(getMondayOfWeek(prev), -7));
            } else if (desktopView === 'year') {
                setCenterDate(prev => {
                    const y = new Date(prev + 'T12:00:00').getFullYear();
                    return `${y - 1}-01-01`;
                });
            } else {
                setCenterDate(prev => {
                    const pd = new Date(prev + 'T12:00:00');
                    const month = pd.getMonth() === 0 ? 11 : pd.getMonth() - 1;
                    const year = pd.getMonth() === 0 ? pd.getFullYear() - 1 : pd.getFullYear();
                    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
                });
            }
        });
    }, [canGoPrev, desktopView, guardedAction]);

    const handleNext = useCallback(() => {
        if (!canGoNext) return;
        guardedAction(() => {
            if (desktopView === 'day') {
                setCenterDate(prev => addDays(prev, 1));
            } else if (desktopView === 'week') {
                setCenterDate(prev => addDays(getMondayOfWeek(prev), 7));
            } else if (desktopView === 'year') {
                setCenterDate(prev => {
                    const y = new Date(prev + 'T12:00:00').getFullYear();
                    return `${y + 1}-01-01`;
                });
            } else {
                setCenterDate(prev => {
                    const pd = new Date(prev + 'T12:00:00');
                    const month = pd.getMonth() === 11 ? 0 : pd.getMonth() + 1;
                    const year = pd.getMonth() === 11 ? pd.getFullYear() + 1 : pd.getFullYear();
                    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
                });
            }
        });
    }, [canGoNext, desktopView, guardedAction]);

    const handleToday = useCallback(() => guardedAction(() => setCenterDate(today)), [today, guardedAction]);

    // ── Event editor state ──
    const [editorEvent, setEditorEvent] = useState<Event | null>(null);
    const [isCreatingEvent, setIsCreatingEvent] = useState(false);

    const handleEditEvent = useCallback((event: Event) => {
        setEditorEvent(event);
        setIsCreatingEvent(false);
    }, []);

    // ── Onboarding state ──
    const [onboardingDate, setOnboardingDate] = useState<string | null>(null);
    const topCategories = useMemo(() => categories.filter(c => c.parent_id === null), [categories]);

    useEffect(() => {
        if (!onboardingDate) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [onboardingDate]);

    const handleStartOnboarding = useCallback((date: string) => {
        setOnboardingDate(date);
    }, []);

    // ── Closure editor state ──
    const [closureEditorOpen, setClosureEditorOpen] = useState(false);
    const [editingClosure, setEditingClosure] = useState<ExceptionalClosure | null>(null);
    const [closurePrefillDate, setClosurePrefillDate] = useState<string | undefined>(undefined);

    // ─── Closure editor helpers ───────────────────────────────────────────────

    const openCreateClosure = useCallback((prefillDate?: string) => {
        setEditingClosure(null);
        setClosurePrefillDate(prefillDate);
        setClosureEditorOpen(true);
    }, []);

    const closeClosureEditor = useCallback(() => {
        setClosureEditorOpen(false);
        setEditingClosure(null);
        setClosurePrefillDate(undefined);
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col overflow-hidden h-[calc(100dvh-4rem)]">
            {onboardingDate ? (
                <div className="flex flex-col flex-1 min-h-0 pb-16 sidebar:pb-0">
                    <MenuOnboarding
                        date={onboardingDate}
                        restaurantId={restaurantId}
                        categories={topCategories}
                        onDone={() => { setOnboardingDate(null); reload(); }}
                        onCancel={() => setOnboardingDate(null)}
                    />
                </div>
            ) : (
                <>
                    <CalendarToolbar
                        label={toolbarLabel}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onToday={handleToday}
                        desktopView={desktopView}
                        onDesktopView={v => guardedAction(() => setDesktopView(v))}
                        mobileView={mobileView}
                        onMobileView={v => guardedAction(() => setMobileView(v))}
                        onAddMenu={() => guardedAction(() => { setCenterDate(today); setDesktopView('day'); })}
                        onAddEvent={() => { setIsCreatingEvent(true); setEditorEvent(null); }}
                        onAddClosure={() => openCreateClosure(today)}
                        canEdit={canEdit}
                        canGoPrev={canGoPrev}
                        canGoNext={canGoNext}
                    />

                    {/* Loading / Error */}
                    {isLoading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    )}
                    {!isLoading && !!error && (
                        <div className="flex-1 flex items-center justify-center p-8">
                            <InlineError type={getErrorType(error)} onRetry={reload} />
                        </div>
                    )}

                    {/* Views */}
                    {!isLoading && !error && (
                        <>
                            {/* ── Desktop ── */}
                            <div className="hidden md:flex flex-col flex-1 overflow-hidden">
                                {desktopView === 'day' && (
                                    <DayView
                                        selectedDate={centerDate}
                                        data={data}
                                        canEdit={canEdit}
                                        restaurantId={restaurantId}
                                        serviceDays={serviceDays}
                                        categories={categories}
                                        onDateChange={setCenterDate}
                                        onReload={reload}
                                        onDirtyChange={setEditorDirty}
                                        onEditEvent={handleEditEvent}
                                        onStartOnboarding={handleStartOnboarding}
                                    />
                                )}
                                {desktopView === 'week' && (
                                    <WeekView
                                        weekStart={getMondayOfWeek(centerDate)}
                                        data={data}
                                        canEdit={canEdit}
                                        serviceDays={serviceDays}
                                        restaurantId={restaurantId}
                                        categories={categories}
                                        onNavigate={handleNavigate}
                                        onReload={reload}
                                        onDirtyChange={setEditorDirty}
                                        onEditEvent={handleEditEvent}
                                    />
                                )}
                                {desktopView === 'month' && (
                                    <MonthView
                                        year={curYear}
                                        month={curMonth}
                                        data={data}
                                        canEdit={canEdit}
                                        serviceDays={serviceDays}
                                        categories={categories}
                                        onNavigate={handleNavigate}
                                        onReload={reload}
                                        onEditEvent={handleEditEvent}
                                    />
                                )}
                                {desktopView === 'year' && (
                                    <YearView
                                        year={curYear}
                                        data={data}
                                        canEdit={canEdit}
                                        onNavigate={handleNavigate}
                                        onReload={reload}
                                    />
                                )}
                            </div>

                            {/* ── Mobile ── */}
                            <div className="flex md:hidden flex-col flex-1 overflow-hidden">
                                {mobileView === 'day' && (
                                    <DayView
                                        selectedDate={centerDate}
                                        data={data}
                                        canEdit={canEdit}
                                        restaurantId={restaurantId}
                                        serviceDays={serviceDays}
                                        categories={categories}
                                        onDateChange={setCenterDate}
                                        onReload={reload}
                                        onDirtyChange={setEditorDirty}
                                        onEditEvent={handleEditEvent}
                                        onStartOnboarding={handleStartOnboarding}
                                    />
                                )}
                                {mobileView === 'week' && (
                                    <WeekView
                                        weekStart={getMondayOfWeek(centerDate)}
                                        data={data}
                                        canEdit={canEdit}
                                        serviceDays={serviceDays}
                                        restaurantId={restaurantId}
                                        categories={categories}
                                        onNavigate={handleNavigate}
                                        onReload={reload}
                                        onDirtyChange={setEditorDirty}
                                        onEditEvent={handleEditEvent}
                                    />
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ── EventEditor ── */}
            {(isCreatingEvent || editorEvent) && (
                <EventEditor
                    event={editorEvent}
                    onClose={() => { setEditorEvent(null); setIsCreatingEvent(false); }}
                    onSave={() => { setEditorEvent(null); setIsCreatingEvent(false); reload(); }}
                    storageConfigured={storageConfigured}
                />
            )}

            {/* ── Closure Editor (toolbar "Nouvelle fermeture") ── */}
            <ClosureEditor
                open={closureEditorOpen}
                closure={editingClosure}
                prefillStart={closurePrefillDate}
                onClose={closeClosureEditor}
                onSaved={() => { closeClosureEditor(); reload(); }}
            />

            {/* ── Dirty guard dialog (view changes) ── */}
            <AlertDialog open={isGuardDialogOpen} onOpenChange={open => { if (!open) handleGuardCancel(); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Modifications non sauvegardées</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous avez des modifications non enregistrées. Si vous continuez, elles seront perdues.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleGuardCancel}>
                            Annuler
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleGuardConfirm}
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
