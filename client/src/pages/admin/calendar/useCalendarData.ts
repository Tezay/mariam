import { useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useSiteRef } from '@/contexts/SiteContext';
import { menusApi, type Menu } from '@/lib/api/menus';
import { sitesApi } from '@/lib/api/sites';
import { eventsApi, Event } from '@/lib/api/events';
import { closuresApi, ExceptionalClosure } from '@/lib/api/closures';
import { addDays } from '@/lib/date-utils';

export interface DayData {
  date: string;
  menu: Menu | null;
  events: Event[];
  closure: ExceptionalClosure | null;
  isServiceDay: boolean;
}

export type CalendarData = Record<string, DayData>;

export function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay(); // 0=Sun
  const daysFromMonday = (dayOfWeek + 6) % 7;
  return addDays(dateStr, -daysFromMonday);
}

/** 0 is Monday. */
function dateToMariamDay(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7;
}

function weekMondays(rangeStart: string, rangeEnd: string): string[] {
  const mondays: string[] = [];
  for (let cursor = getMondayOf(rangeStart); cursor <= rangeEnd; cursor = addDays(cursor, 7)) {
    mondays.push(cursor);
  }
  return mondays;
}

interface UseCalendarDataResult {
  data: CalendarData;
  isLoading: boolean;
  error: unknown;
  reload: () => void;
  serviceDays: number[]; // 0 is Monday
  storageConfigured: boolean;
}

const STALE_TIME = 60_000;

export function useCalendarData(
  rangeStart: string,
  rangeEnd: string,
  siteId?: number
): UseCalendarDataResult {
  const queryClient = useQueryClient();
  const site = useSiteRef();

  const mondays = useMemo(() => weekMondays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);

  // A year would take 50+ week requests, and the year view shows no menu.
  const skipMenus = mondays.length > 8;
  const fetchedMondays = skipMenus ? [] : mondays;

  const weekResults = useQueries({
    queries: fetchedMondays.map((monday) => ({
      queryKey: ['calendar-week', site.org, site.site, monday],
      queryFn: () => menusApi.list(site, monday, addDays(monday, 6)),
      staleTime: STALE_TIME,
    })),
  });

  const siteQuery = useQuery({
    queryKey: ['site', site.org, site.site],
    queryFn: () => sitesApi.getOwn(site),
    staleTime: STALE_TIME,
  });

  const eventsQuery = useQuery({
    queryKey: ['calendar-events', siteId ?? 'self'],
    queryFn: () => eventsApi.list(false, siteId, true) as Promise<Event[]>,
    staleTime: STALE_TIME,
  });

  const closuresQuery = useQuery({
    queryKey: ['calendar-closures', siteId ?? 'self'],
    queryFn: () => closuresApi.list(false, siteId, true) as Promise<ExceptionalClosure[]>,
    staleTime: STALE_TIME,
  });

  const storageQuery = useQuery({
    queryKey: ['storage-status'],
    queryFn: () => eventsApi.storageStatus().catch(() => false),
    staleTime: 5 * 60_000,
  });

  const weekSignature = weekResults.map((r) => r.dataUpdatedAt).join('|');

  const { data, serviceDays } = useMemo(() => {
    const events = eventsQuery.data ?? [];
    const closures = closuresQuery.data ?? [];
    const result: CalendarData = {};
    const sdays = siteQuery.data?.service_days ?? [];

    if (!skipMenus) {
      fetchedMondays.forEach((monday, index) => {
        const byDate = new Map((weekResults[index].data ?? []).map((menu) => [menu.date, menu]));
        for (let offset = 0; offset < 7; offset += 1) {
          const date = addDays(monday, offset);
          result[date] = {
            date,
            menu: byDate.get(date) ?? null,
            events: [],
            closure: null,
            isServiceDay: sdays.includes(dateToMariamDay(date)),
          };
        }
      });
    }

    for (const event of events) {
      const d = event.event_date;
      if (!result[d]) {
        result[d] = {
          date: d,
          menu: null,
          events: [],
          closure: null,
          isServiceDay: sdays.includes(dateToMariamDay(d)),
        };
      }
      result[d].events.push(event);
    }

    for (const closure of closures) {
      let d = closure.start_date;
      while (d <= closure.end_date) {
        if (!result[d]) {
          result[d] = {
            date: d,
            menu: null,
            events: [],
            closure: null,
            isServiceDay: sdays.includes(dateToMariamDay(d)),
          };
        }
        if (!result[d].closure) result[d].closure = closure;
        d = addDays(d, 1);
      }
    }

    return { data: result, serviceDays: sdays };
    // Query data is tracked via the *UpdatedAt signatures, keeping the result stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    weekSignature,
    eventsQuery.dataUpdatedAt,
    closuresQuery.dataUpdatedAt,
    siteQuery.dataUpdatedAt,
    skipMenus,
  ]);

  const isLoading =
    weekResults.some((r) => r.isPending) ||
    siteQuery.isPending ||
    eventsQuery.isPending ||
    closuresQuery.isPending;
  const error =
    weekResults.find((r) => r.error)?.error ??
    siteQuery.error ??
    eventsQuery.error ??
    closuresQuery.error ??
    null;

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar-week'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-closures'] });
    queryClient.invalidateQueries({ queryKey: ['storage-status'] });
  };

  return {
    data,
    isLoading,
    error,
    reload,
    serviceDays,
    storageConfigured: (storageQuery.data as boolean) ?? false,
  };
}
