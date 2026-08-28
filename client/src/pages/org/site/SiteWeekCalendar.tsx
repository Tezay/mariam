/**
 * Read-only week planner for one site, embedded in the director's site page.
 *
 * Reuses the site dashboard's WeekView so both dashboards render menus
 * identically; `canEdit` is what keeps every editing affordance out.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { categoriesApi, type MenuCategory } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getMondayOf, useCalendarData } from '@/pages/admin/calendar/useCalendarData';
import { WeekView } from '@/pages/admin/calendar/WeekView';

function formatWeekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const format = (iso: string, withYear: boolean) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(new Date(iso + 'T12:00:00'));
  return `${format(monday, false)} – ${format(sunday, true)}`;
}

export function SiteWeekCalendar({ siteId }: { siteId: number }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = useMemo(() => addDays(getMondayOf(parisToday()), weekOffset * 7), [weekOffset]);
  const sunday = useMemo(() => addDays(monday, 6), [monday]);

  const { data, isLoading, serviceDays, reload } = useCalendarData(monday, sunday, siteId);

  const { data: categories = [] } = useQuery({
    queryKey: ['site-categories', siteId],
    queryFn: async () => (await categoriesApi.list(siteId)).categories as MenuCategory[],
    staleTime: 5 * 60_000,
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Menus de la semaine</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekOffset((value) => value - 1)}
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[190px] text-center text-xs font-medium tabular-nums text-muted-foreground">
            {formatWeekLabel(monday)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekOffset((value) => value + 1)}
            aria-label="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setWeekOffset(0)}
            >
              Aujourd'hui
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <WeekView
              weekStart={monday}
              data={data}
              canEdit={false}
              serviceDays={serviceDays}
              restaurantId={siteId}
              categories={categories}
              onReload={reload}
            />
          </div>
        )}
      </div>
    </section>
  );
}
