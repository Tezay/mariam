import { useState, useEffect, useCallback, useRef } from 'react';
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

const CACHE_TTL = 60_000; // 60 secondes

export function useCalendarData(rangeStart: string, rangeEnd: string): UseCalendarDataResult {
  const [data, setData] = useState<CalendarData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [restaurantId, setRestaurantId] = useState<number | undefined>(undefined);
  const [serviceDays, setServiceDays] = useState<number[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(false);

  // Caches pour éviter de re-fetcher à chaque navigation
  const eventsCache = useRef<{ data: Event[]; ts: number } | null>(null);
  const closuresCache = useRef<{ data: ExceptionalClosure[]; ts: number } | null>(null);
  const weekCache = useRef<Record<number, { data: unknown; ts: number }>>({});
  // Compteur de génération pour ignorer les réponses stale (navigation rapide)
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generationRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const weekOffsets = computeWeekOffsets(rangeStart, rangeEnd);

      // For large ranges (year view), skip per-week menu fetching to avoid
      // saturating the backend with 50+ simultaneous requests.
      const skipMenus = weekOffsets.length > 8;

      const now = Date.now();
      const cachedEvents =
        eventsCache.current && now - eventsCache.current.ts < CACHE_TTL
          ? eventsCache.current.data
          : null;
      const cachedClosures =
        closuresCache.current && now - closuresCache.current.ts < CACHE_TTL
          ? closuresCache.current.data
          : null;

      const fetchWeek = (o: number) => {
        const cached = weekCache.current[o];
        if (cached && Date.now() - cached.ts < CACHE_TTL) return Promise.resolve(cached.data);
        return menusApi.getWeek(o).then((data) => {
          weekCache.current[o] = { data, ts: Date.now() };
          return data;
        });
      };

      const [weekDataArr, events, closuresResp, storageStatus] = await Promise.all([
        skipMenus ? Promise.resolve([]) : Promise.all(weekOffsets.map(fetchWeek)),
        cachedEvents ? Promise.resolve(cachedEvents) : eventsApi.list(false, undefined, true),
        cachedClosures ? Promise.resolve(cachedClosures) : closuresApi.list(false, undefined, true),
        eventsApi.storageStatus().catch(() => false),
      ]);

      // Mettre à jour les caches si on a fetché
      if (!cachedEvents) eventsCache.current = { data: events as Event[], ts: Date.now() };
      if (!cachedClosures)
        closuresCache.current = {
          data: closuresResp as ExceptionalClosure[],
          ts: Date.now(),
        };

      const result: CalendarData = {};
      let rid: number | undefined;
      let sdays: number[] = [];

      if (skipMenus) {
        // Fetch restaurant config from a single week call to get service_days
        const baseWeek = await fetchWeek(0);
        rid = (baseWeek as { restaurant_id?: number }).restaurant_id;
        sdays = ((baseWeek as { service_days?: number[] }).service_days ?? []).map(
          (d: number) => d
        );
      }

      // Menus depuis les semaines
      for (const wd of weekDataArr) {
        if (!rid) rid = wd.restaurant_id;
        if (!sdays.length) sdays = (wd.service_days as number[]).map((d) => d); // 0=Lun
        for (const [date, menu] of Object.entries(wd.menus as Record<string, Menu | null>)) {
          result[date] = {
            date,
            menu: menu ?? null,
            events: [],
            closure: null,
            isServiceDay: sdays.includes(dateToMariamDay(date)),
          };
        }
      }

      // Événements
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

      // Fermetures (couvrent des plages)
      for (const closure of closuresResp) {
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

      // Ignorer les réponses stale si une navigation plus récente a déjà lancé un load
      if (generationRef.current !== gen) return;
      setData(result);
      setRestaurantId(rid);
      setServiceDays(sdays);
      setStorageConfigured(storageStatus as boolean);
    } catch (err) {
      if (generationRef.current !== gen) return;
      setError(err);
    } finally {
      if (generationRef.current === gen) setIsLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    const id = setTimeout(() => load(), 300);
    return () => clearTimeout(id);
  }, [load]);

  const reload = useCallback(() => {
    closuresCache.current = null;
    eventsCache.current = null;
    weekCache.current = {};
    load();
  }, [load]);

  return { data, isLoading, error, reload, restaurantId, serviceDays, storageConfigured };
}
