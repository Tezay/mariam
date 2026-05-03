import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { menusApi } from '@/lib/api';
import type { MenuItem } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

// ─── Mini date-picker (multi-select) ─────────────────────────────────────────

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

interface MultiDatePickerProps {
    selected: Set<string>;
    onChange: (dates: Set<string>) => void;
}

function MultiDatePicker({ selected, onChange }: MultiDatePickerProps) {
    const today = parisToday();
    const d = new Date(today + 'T12:00:00');
    const [year, setYear] = useState(d.getFullYear());
    const [month, setMonth] = useState(d.getMonth());

    const mm = String(month + 1).padStart(2, '0');
    const firstDay = `${year}-${mm}-01`;
    const lastDay = `${year}-${mm}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
    const days = getMonthGrid(year, month);

    const prevMonth = () => {
        if (month === 0) { setYear(y => y - 1); setMonth(11); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setYear(y => y + 1); setMonth(0); }
        else setMonth(m => m + 1);
    };

    const toggle = (date: string) => {
        const next = new Set(selected);
        if (next.has(date)) next.delete(date);
        else next.add(date);
        onChange(next);
    };

    return (
        <div className="rounded-xl border border-border p-3 bg-card">
            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold">{FR_MONTHS_LONG[month]} {year}</span>
                <button type="button" onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
                {FR_DAYS_MINI.map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {days.map(date => {
                    const isCurrentMonth = date >= firstDay && date <= lastDay;
                    const isSelected = selected.has(date);
                    const dayNum = parseInt(date.split('-')[2], 10);
                    return (
                        <button
                            key={date}
                            type="button"
                            disabled={!isCurrentMonth}
                            onClick={() => toggle(date)}
                            className={cn(
                                'w-full aspect-square rounded-md text-[11px] font-medium transition-colors',
                                !isCurrentMonth && 'opacity-20 pointer-events-none',
                                isSelected && 'bg-primary text-white',
                                !isSelected && isCurrentMonth && 'hover:bg-muted',
                            )}
                        >
                            {dayNum}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── DuplicatePanel ───────────────────────────────────────────────────────────

type ConflictMode = 'replace' | 'ignore' | 'add';

interface DuplicatePanelProps {
    open: boolean;
    sourceItems: MenuItem[];
    onClose: () => void;
    onDone: () => void;
}

export function DuplicatePanel({ open, sourceItems, onClose, onDone }: DuplicatePanelProps) {
    const [targetDates, setTargetDates] = useState<Set<string>>(new Set());
    const [conflictMode, setConflictMode] = useState<ConflictMode>('ignore');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDuplicate = async () => {
        if (targetDates.size === 0) { setError('Sélectionnez au moins une date cible.'); return; }
        setIsSaving(true);
        setError(null);
        try {
            for (const date of targetDates) {
                if (conflictMode === 'ignore') {
                    try {
                        const existing = await menusApi.getByDate(date);
                        if (existing) continue;
                    } catch { /* no existing menu */ }
                } else if (conflictMode === 'replace') {
                    try {
                        const existing = await menusApi.getByDate(date);
                        if (existing) await menusApi.delete(existing.id);
                    } catch { /* no existing menu */ }
                }
                await menusApi.save(date, sourceItems);
            }
            onDone();
        } catch {
            setError('Erreur lors de la duplication. Veuillez réessayer.');
        } finally {
            setIsSaving(false);
        }
    };

    const CONFLICT_OPTIONS: { value: ConflictMode; label: string; desc: string }[] = [
        { value: 'replace', label: 'Remplacer', desc: 'Écrase le menu existant' },
        { value: 'ignore', label: 'Ignorer', desc: 'Saute les jours déjà remplis' },
        { value: 'add', label: 'Ajouter', desc: 'Ajoute aux items existants' },
    ];

    return (
        <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
                <SheetHeader>
                    <SheetTitle>Dupliquer la sélection</SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                            {sourceItems.length} item{sourceItems.length > 1 ? 's' : ''} sélectionné{sourceItems.length > 1 ? 's' : ''}
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {sourceItems.slice(0, 6).map((item, i) => (
                                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full truncate max-w-[120px]">
                                    {item.name}
                                </span>
                            ))}
                            {sourceItems.length > 6 && (
                                <span className="text-xs text-muted-foreground">+{sourceItems.length - 6}</span>
                            )}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Dates cibles</p>
                        <MultiDatePicker selected={targetDates} onChange={setTargetDates} />
                        {targetDates.size > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {Array.from(targetDates).sort().map(date => (
                                    <span key={date} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                        {date}
                                        <button type="button" onClick={() => {
                                            const next = new Set(targetDates);
                                            next.delete(date);
                                            setTargetDates(next);
                                        }}>
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">En cas de conflit</p>
                        <div className="space-y-1">
                            {CONFLICT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setConflictMode(opt.value)}
                                    className={cn(
                                        'w-full flex items-start gap-3 p-2.5 rounded-xl border text-left transition-colors',
                                        conflictMode === opt.value
                                            ? 'bg-primary/10 border-primary'
                                            : 'border-border hover:bg-muted',
                                    )}
                                >
                                    <span className={cn(
                                        'w-4 h-4 rounded-full border-2 mt-0.5 shrink-0',
                                        conflictMode === opt.value ? 'border-primary bg-primary' : 'border-muted-foreground',
                                    )} />
                                    <div>
                                        <p className="text-sm font-medium">{opt.label}</p>
                                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <SheetFooter className="gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>Annuler</Button>
                    <Button onClick={handleDuplicate} disabled={isSaving || targetDates.size === 0}>
                        {isSaving ? 'Duplication…' : `Dupliquer vers ${targetDates.size} jour${targetDates.size > 1 ? 's' : ''}`}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
