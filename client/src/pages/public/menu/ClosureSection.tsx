import { useState } from 'react';
import { CalendarOff, ChevronRight } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { Closure } from '@/lib/api/closures';

function formatClosureDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', opts);
  return start === end ? fmt(start) : `du ${fmt(start)} au ${fmt(end)}`;
}

interface ClosureSectionProps {
  closures: Closure[];
}

export function ClosureSection({ closures }: ClosureSectionProps) {
  const [selected, setSelected] = useState<Closure | null>(null);

  if (closures.length === 0) return null;

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold lg:text-2xl lg:tracking-tight">
          <CalendarOff aria-hidden className="h-5 w-5 shrink-0 text-site-danger" />
          Fermetures à venir
        </h2>

        <div className="flex flex-col gap-2">
          {closures.map((closure) => {
            const hasDetail = Boolean(closure.description);
            return (
              <button
                key={closure.id}
                type="button"
                onClick={() => (hasDetail ? setSelected(closure) : undefined)}
                className={`flex w-full items-start gap-3 rounded-2xl border border-site-danger-line bg-site-danger-soft px-4 py-3 text-left ${hasDetail ? 'transition-opacity active:opacity-80' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-site-danger">
                    {formatClosureDateRange(closure.start_date, closure.end_date)}
                  </p>
                  {closure.reason && (
                    <p className="mt-0.5 text-xs text-site-subtle">{closure.reason}</p>
                  )}
                </div>
                {hasDetail && (
                  <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-site-subtle" />
                )}
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
        <DrawerContent className="flex flex-col bg-site-surface p-0 text-site-text">
          {selected && (
            <>
              <DrawerHeader className="shrink-0 px-5 pb-3 pt-2">
                <div className="mb-1 flex items-center gap-2">
                  <CalendarOff aria-hidden className="h-4 w-4 shrink-0 text-site-danger" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-site-danger">
                    Fermeture exceptionnelle
                  </span>
                </div>
                <DrawerTitle className="text-left text-xl font-bold leading-snug">
                  {formatClosureDateRange(selected.start_date, selected.end_date)}
                </DrawerTitle>
                {selected.reason && (
                  <p className="mt-1 text-sm text-site-subtle">{selected.reason}</p>
                )}
              </DrawerHeader>

              {selected.description && (
                <div className="px-5 pb-8">
                  <p className="whitespace-pre-line text-sm leading-relaxed">
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
