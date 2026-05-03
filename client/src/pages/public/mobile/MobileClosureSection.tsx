import { useState } from 'react';
import { CalendarOff, ChevronRight } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { ExceptionalClosure } from '@/lib/api';

function formatClosureDateRange(start: string, end: string): string {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', opts);
    return start === end ? fmt(start) : `du ${fmt(start)} au ${fmt(end)}`;
}

interface MobileClosureSectionProps {
    closures: ExceptionalClosure[];
}

export function MobileClosureSection({ closures }: MobileClosureSectionProps) {
    const [selected, setSelected] = useState<ExceptionalClosure | null>(null);

    if (closures.length === 0) return null;

    return (
        <>
            <section className="px-4 pb-4">
                <div className="flex items-center gap-2 mb-3">
                    <CalendarOff className="w-4 h-4 text-red-400 shrink-0" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Fermetures à venir
                    </h2>
                </div>

                <div className="flex flex-col gap-2">
                    {closures.map(closure => {
                        const hasDetail = Boolean(closure.description);
                        return (
                            <button
                                key={closure.id}
                                type="button"
                                onClick={() => hasDetail ? setSelected(closure) : undefined}
                                className={`w-full text-left flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3 ${hasDetail ? 'active:bg-red-100 transition-colors' : ''}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-red-700">
                                        {formatClosureDateRange(closure.start_date, closure.end_date)}
                                    </p>
                                    {closure.reason && (
                                        <p className="text-xs text-red-500 mt-0.5">{closure.reason}</p>
                                    )}
                                </div>
                                {hasDetail && (
                                    <ChevronRight className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            <Drawer open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
                <DrawerContent className="flex flex-col p-0">
                    {selected && (
                        <>
                            <DrawerHeader className="px-5 pt-2 pb-3 shrink-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <CalendarOff className="w-4 h-4 text-red-400 shrink-0" />
                                    <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                                        Fermeture exceptionnelle
                                    </span>
                                </div>
                                <DrawerTitle className="text-xl font-bold text-left leading-snug">
                                    {formatClosureDateRange(selected.start_date, selected.end_date)}
                                </DrawerTitle>
                                {selected.reason && (
                                    <p className="text-sm text-gray-500 mt-1">{selected.reason}</p>
                                )}
                            </DrawerHeader>

                            {selected.description && (
                                <div className="px-5 pb-8">
                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                        {selected.description}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </DrawerContent>
            </Drawer>
        </>
    );
}
