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
        <div className="mb-3 flex items-center gap-2">
          <CalendarOff className="h-4 w-4 shrink-0 text-red-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Fermetures à venir
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          {closures.map((closure) => {
            const hasDetail = Boolean(closure.description);
            return (
              <button
                key={closure.id}
                type="button"
                onClick={() => (hasDetail ? setSelected(closure) : undefined)}
                className={`flex w-full items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-left ${hasDetail ? 'transition-colors active:bg-red-100' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-700">
                    {formatClosureDateRange(closure.start_date, closure.end_date)}
                  </p>
                  {closure.reason && (
                    <p className="mt-0.5 text-xs text-red-500">{closure.reason}</p>
                  )}
                </div>
                {hasDetail && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />}
              </button>
            );
          })}
        </div>
      </section>

      <Drawer
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DrawerContent className="flex flex-col p-0">
          {selected && (
            <>
              <DrawerHeader className="shrink-0 px-5 pb-3 pt-2">
                <div className="mb-1 flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                    Fermeture exceptionnelle
                  </span>
                </div>
                <DrawerTitle className="text-left text-xl font-bold leading-snug">
                  {formatClosureDateRange(selected.start_date, selected.end_date)}
                </DrawerTitle>
                {selected.reason && <p className="mt-1 text-sm text-gray-500">{selected.reason}</p>}
              </DrawerHeader>

              {selected.description && (
                <div className="px-5 pb-8">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
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
