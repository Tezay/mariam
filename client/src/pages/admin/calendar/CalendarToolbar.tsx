import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, CalendarPlus, Sparkles, CalendarOff, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { addDays, parisToday } from '@/lib/date-utils';

export type DesktopView = 'day' | 'week' | 'month' | 'year';
export type MobileView = 'day' | 'week';

const DESKTOP_VIEWS: DesktopView[] = ['day', 'week', 'month', 'year'];
const DESKTOP_LABELS: Record<DesktopView, string> = { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' };

const MOBILE_VIEWS: MobileView[] = ['day', 'week'];
const MOBILE_LABELS: Record<MobileView, string> = { day: 'Jour', week: 'Sem.' };

const FR_MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const FR_DAYS_MINI = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function getMondayOf(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const back = (d.getDay() + 6) % 7;
    return addDays(dateStr, -back);
}

function getMonthGrid(year: number, month: number): string[] {
    const mm = String(month + 1).padStart(2, '0');
    const first = `${year}-${mm}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const last = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
    const start = getMondayOf(first);
    const end = addDays(getMondayOf(last), 6);
    const days: string[] = [];
    let c = start;
    while (c <= end) { days.push(c); c = addDays(c, 1); }
    return days;
}

interface SingleDatePickerProps {
    onSelect: (date: string) => void;
    onBack: () => void;
}

function SingleDatePicker({ onSelect, onBack }: SingleDatePickerProps) {
    const today = parisToday();
    const d = new Date(today + 'T12:00:00');
    const [year, setYear] = useState(d.getFullYear());
    const [month, setMonth] = useState(d.getMonth());
    const [selected, setSelected] = useState<string | null>(null);

    const days = getMonthGrid(year, month);
    const mm = String(month + 1).padStart(2, '0');
    const firstOfMonth = `${year}-${mm}-01`;
    const lastOfMonth = `${year}-${mm}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

    const prevMonth = () => {
        if (month === 0) { setYear(y => y - 1); setMonth(11); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setYear(y => y + 1); setMonth(0); }
        else setMonth(m => m + 1);
    };

    return (
        <div className="p-2 w-64">
            {/* Header */}
            <div className="flex items-center gap-1 mb-2">
                <button type="button" onClick={onBack} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                    <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="flex-1 text-center text-xs font-semibold">
                    {FR_MONTHS_LONG[month]} {year}
                </span>
                <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
                {FR_DAYS_MINI.map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-0.5">{d}</div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-0.5">
                {days.map(date => {
                    const inMonth = date >= firstOfMonth && date <= lastOfMonth;
                    const isToday = date === today;
                    const isSelected = date === selected;
                    return (
                        <button
                            key={date}
                            type="button"
                            onClick={() => setSelected(date === selected ? null : date)}
                            className={cn(
                                'text-[11px] rounded-lg py-1 text-center transition-colors',
                                !inMonth && 'opacity-25',
                                isToday && !isSelected && 'font-bold text-primary',
                                isSelected
                                    ? 'bg-primary text-white font-semibold'
                                    : 'hover:bg-muted text-foreground',
                            )}
                        >
                            {parseInt(date.split('-')[2])}
                        </button>
                    );
                })}
            </div>

            {/* Confirm button */}
            <Button
                size="sm"
                className="w-full mt-2 rounded-xl h-7 text-xs"
                disabled={!selected}
                onClick={() => selected && onSelect(selected)}
            >
                Créer le menu
            </Button>
        </div>
    );
}

interface CalendarToolbarProps {
    label: string;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    desktopView: DesktopView;
    onDesktopView: (v: DesktopView) => void;
    mobileView: MobileView;
    onMobileView: (v: MobileView) => void;
    onAddMenu: (date: string) => void;
    onAddEvent: () => void;
    onAddClosure: () => void;
    canEdit: boolean;
    canGoPrev: boolean;
    canGoNext: boolean;
}

export function CalendarToolbar({
    label,
    onPrev,
    onNext,
    onToday,
    desktopView,
    onDesktopView,
    mobileView,
    onMobileView,
    onAddMenu,
    onAddEvent,
    onAddClosure,
    canEdit,
    canGoPrev,
    canGoNext,
}: CalendarToolbarProps) {
    const desktopActiveIdx = DESKTOP_VIEWS.indexOf(desktopView);
    const mobileActiveIdx = MOBILE_VIEWS.indexOf(mobileView);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [showPicker, setShowPicker] = useState(false);

    const handleDropdownOpenChange = (open: boolean) => {
        setDropdownOpen(open);
        if (!open) setShowPicker(false);
    };

    return (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card shrink-0">
            {/* Navigation */}
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={onPrev}
                    disabled={!canGoPrev}
                    className={cn(
                        'p-1.5 rounded-lg text-muted-foreground transition-colors',
                        canGoPrev ? 'hover:bg-muted' : 'opacity-40 cursor-not-allowed',
                    )}
                    aria-label="Précédent"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canGoNext}
                    className={cn(
                        'p-1.5 rounded-lg text-muted-foreground transition-colors',
                        canGoNext ? 'hover:bg-muted' : 'opacity-40 cursor-not-allowed',
                    )}
                    aria-label="Suivant"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Label période */}
            <button
                type="button"
                onClick={onToday}
                className="font-semibold text-sm text-foreground hover:text-primary transition-colors min-w-0 truncate max-w-[200px]"
            >
                {label}
            </button>

            <div className="flex-1" />

            {/* Pill toggles + CTA groupés (ne se séparent jamais par wrap) */}
            <div className="flex items-center gap-1.5 shrink-0">
                {/* Toggle vues desktop — pill animée */}
                <div className="hidden md:flex relative items-center rounded-xl border border-border bg-muted/40 p-0.5">
                    <span
                        aria-hidden
                        className="absolute top-0.5 bottom-0.5 rounded-[9px] bg-card shadow-sm pointer-events-none"
                        style={{
                            width: `calc(${100 / DESKTOP_VIEWS.length}% - 1px)`,
                            transform: `translateX(calc(${desktopActiveIdx} * 100% + ${desktopActiveIdx}px))`,
                            transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                            left: '1px',
                        }}
                    />
                    {DESKTOP_VIEWS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onDesktopView(key)}
                            style={{ width: `${100 / DESKTOP_VIEWS.length}%` }}
                            className={cn(
                                'relative z-10 text-sm font-medium py-1 px-3 rounded-[9px] transition-colors select-none',
                                desktopView === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {DESKTOP_LABELS[key]}
                        </button>
                    ))}
                </div>

                {/* Toggle vues mobile — pill animée */}
                <div className="flex md:hidden relative items-center rounded-xl border border-border bg-muted/40 p-0.5">
                    <span
                        aria-hidden
                        className="absolute top-0.5 bottom-0.5 rounded-[9px] bg-card shadow-sm pointer-events-none"
                        style={{
                            width: `calc(${100 / MOBILE_VIEWS.length}% - 1px)`,
                            transform: `translateX(calc(${mobileActiveIdx} * 100% + ${mobileActiveIdx}px))`,
                            transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                            left: '1px',
                        }}
                    />
                    {MOBILE_VIEWS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onMobileView(key)}
                            style={{ width: `${100 / MOBILE_VIEWS.length}%` }}
                            className={cn(
                                'relative z-10 text-sm font-medium py-1 px-3 rounded-[9px] transition-colors select-none',
                                mobileView === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {MOBILE_LABELS[key]}
                        </button>
                    ))}
                </div>

                {/* CTA "+" */}
                {canEdit && (
                    <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="gap-1.5 rounded-xl">
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Nouveau</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="p-1">
                            {showPicker ? (
                                <SingleDatePicker
                                    onBack={() => setShowPicker(false)}
                                    onSelect={date => {
                                        setDropdownOpen(false);
                                        onAddMenu(date);
                                    }}
                                />
                            ) : (
                                <>
                                    <DropdownMenuItem
                                        onSelect={e => { e.preventDefault(); setShowPicker(true); }}
                                        className="gap-2"
                                    >
                                        <CalendarPlus className="w-4 h-4 text-muted-foreground" />
                                        Nouveau menu
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => requestAnimationFrame(onAddEvent)} className="gap-2">
                                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                                        Nouvel événement
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => requestAnimationFrame(onAddClosure)} className="gap-2">
                                        <CalendarOff className="w-4 h-4 text-muted-foreground" />
                                        Nouvelle fermeture
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
}
