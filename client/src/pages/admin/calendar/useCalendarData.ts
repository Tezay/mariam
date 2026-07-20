import { useMemo } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { menusApi, eventsApi, closuresApi, Menu, Event, ExceptionalClosure } from '@/lib/api';
import { parisToday, addDays } from '@/lib/date-utils';

export interface DayData {
  date: string;
  menu: Menu | null;
  events: Event[];
  closure: ExceptionalClosure | null;
  isServiceDay: boolean;
}

export type CalendarData = Record<string, DayData>;

// ─── Helpers date ────────────────────────────────────────────────────────────

/** Retourne la date du lundi de la semaine contenant dateStr (ISO). */
export function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay(); // 0=Sun
  const daysFromMonday = (dayOfWeek + 6) % 7;
  return addDays(dateStr, -daysFromMonday);
}

/** Indice Mariam (0=Lun, 6=Dim) pour une date ISO. */
function dateToMariamDay(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7;
}

/**
 * Calcule les weekOffsets (relatifs à la semaine actuelle) couvrant [rangeStart, rangeEnd].
 * L'API menusApi.getWeek(n) retourne la semaine n relative à la semaine courante.
 */
function computeWeekOffsets(rangeStart: string, rangeEnd: string): number[] {
  const today = parisToday();
  const todayMonday = getMondayOf(today);
  const todayMondayMs = new Date(todayMonday + 'T12:00:00').getTime();

  const startMonday = getMondayOf(rangeStart);
  const endMonday = getMondayOf(rangeEnd);

  const offsets: number[] = [];
  let cursor = startMonday;

  while (cursor <= endMonday) {
    const cursorMs = new Date(cursor + 'T12:00:00').getTime();
    const diffDays = Math.round((cursorMs - todayMondayMs) / (24 * 60 * 60 * 1000));
    const offset = Math.round(diffDays / 7);
    if (!offsets.includes(offset)) offsets.push(offset);
    cursor = addDays(cursor, 7);
  }

  return offsets;
}

// menusApi.getWeek returns a payload keyed by date with the restaurant config.
interface WeekPayload {
  restaurant_id?: number;
  service_days?: number[];
  menus: Record<string, Menu | null>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseCalendarDataResult {
  data: CalendarData;
  isLoading: boolean;
  error: unknown;
  reload: () => void;
  restaurantId: number | undefined;
  serviceDays: number[]; // 0=Lun … 6=Dim (indice Mariam)
  storageConfigured: boolean;
}

const STALE_TIME = 60_000; // 60 secondes — remplace les caches maison précédents

export function useCalendarData(rangeStart: string, rangeEnd: string): UseCalendarDataResult {
  const queryClient = useQueryClient();

  const weekOffsets = useMemo(
    () => computeWeekOffsets(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );

  // Large ranges (year view) would fire 50+ week requests; fetch only week 0 for
  // the restaurant config and skip per-week menus.
  const skipMenus = weekOffsets.length > 8;
  const fetchedOffsets = skipMenus ? [0] : weekOffsets;

  const weekResults = useQueries({
    queries: fetchedOffsets.map((offset) => ({
      queryKey: ['calendar-week', offset],
      queryFn: () => menusApi.getWeek(offset) as Promise<WeekPayload>,
      staleTime: STALE_TIME,
    })),
  });

  const eventsQuery = useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => eventsApi.list(false, undefined, true) as Promise<Event[]>,
    staleTime: STALE_TIME,
  });

  const closuresQuery = useQuery({
    queryKey: ['calendar-closures'],
    queryFn: () => closuresApi.list(false, undefined, true) as Promise<ExceptionalClosure[]>,
    staleTime: STALE_TIME,
  });

  const storageQuery = useQuery({
    queryKey: ['storage-status'],
    queryFn: () => eventsApi.storageStatus().catch(() => false),
    staleTime: 5 * 60_000,
  });

  // Signature that changes only when the underlying query data changes, so the
  // assembled result keeps a stable reference across unrelated re-renders.
  const weekSignature = weekResults.map((r) => r.dataUpdatedAt).join('|');

  const { data, restaurantId, serviceDays } = useMemo(() => {
    const weekPayloads = weekResults.map((r) => r.data).filter(Boolean) as WeekPayload[];
    const events = eventsQuery.data ?? [];
    const closures = closuresQuery.data ?? [];
    const result: CalendarData = {};
    let rid: number | undefined;
    let sdays: number[] = [];

    // Config (restaurant id + service days) from the fetched weeks.
    for (const wp of weekPayloads) {
      if (rid === undefined) rid = wp.restaurant_id;
      if (!sdays.length && wp.service_days) sdays = wp.service_days.map((d) => d);
    }

    if (!skipMenus) {
      for (const wp of weekPayloads) {
        for (const [date, menu] of Object.entries(wp.menus ?? {})) {
          result[date] = {
            date,
            menu: menu ?? null,
            events: [],
            closure: null,
            isServiceDay: sdays.includes(dateToMariamDay(date)),
          };
        }
      }
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

    return { data: result, restaurantId: rid, serviceDays: sdays };
    // Query data is tracked via the *UpdatedAt signatures, keeping the result stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekSignature, eventsQuery.dataUpdatedAt, closuresQuery.dataUpdatedAt, skipMenus]);

  const isLoading =
    weekResults.some((r) => r.isPending) || eventsQuery.isPending || closuresQuery.isPending;
  const error =
    weekResults.find((r) => r.error)?.error ?? eventsQuery.error ?? closuresQuery.error ?? null;

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
    restaurantId,
    serviceDays,
    storageConfigured: (storageQuery.data as boolean) ?? false,
  };
}
