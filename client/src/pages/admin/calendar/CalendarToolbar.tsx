import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type DesktopView = 'day' | 'week' | 'month' | 'year';
export type MobileView = 'day' | 'week';

const DESKTOP_VIEWS: DesktopView[] = ['day', 'week', 'month', 'year'];
const DESKTOP_LABELS: Record<DesktopView, string> = { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' };

const MOBILE_VIEWS: MobileView[] = ['day', 'week'];
const MOBILE_LABELS: Record<MobileView, string> = { day: 'Jour', week: 'Sem.' };

interface CalendarToolbarProps {
    label: string;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    desktopView: DesktopView;
    onDesktopView: (v: DesktopView) => void;
    mobileView: MobileView;
    onMobileView: (v: MobileView) => void;
    onAddMenu: () => void;
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
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="gap-1.5 rounded-xl">
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Nouveau</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onAddMenu} className="gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#093EAA] shrink-0" />
                                Nouveau menu
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onAddEvent} className="gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                Nouvel événement
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onAddClosure} className="gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                                Nouvelle fermeture
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
}
