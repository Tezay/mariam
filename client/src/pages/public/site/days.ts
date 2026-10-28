import type { Closure } from '@/lib/api/closures';
import type { Site } from '@/lib/api/sites';
import { addDays } from '@/lib/date-utils';
import { jsDayToMariamDay } from '@/lib/service-utils';

const STRIP_SIZE = 4;

function weekday(date: string): number {
  return jsDayToMariamDay(new Date(`${date}T12:00:00Z`).getUTCDay());
}

/** A site without service days set serves every day, as its status reads. */
export function isServed(day: string, serviceDays: number[]): boolean {
  return serviceDays.length === 0 || serviceDays.includes(weekday(day));
}

export function openDays(
  window: Site['menu_window'],
  serviceDays: number[],
  closures: Closure[]
): string[] {
  const days: string[] = [];
  for (let day = window.from; day <= window.to; day = addDays(day, 1)) {
    const closed = closures.some((closure) => closure.start_date <= day && day <= closure.end_date);
    if (isServed(day, serviceDays) && !closed) days.push(day);
  }
  return days;
}

export function dayHref(day: string, today: string): string {
  return day === today ? '.' : `?date=${day}`;
}

export interface DayStrip {
  days: string[];
  previous: string | null;
  next: string | null;
}

/** Four days from today, or from the chosen day when it lies further; today stays in the
 * strip even closed, for its message. */
export function dayStrip(open: string[], today: string, selected: string): DayStrip {
  const fromToday = [today, ...open.filter((day) => day > today)].slice(0, STRIP_SIZE);
  const days = fromToday.includes(selected)
    ? fromToday
    : [selected, ...open.filter((day) => day > selected)].slice(0, STRIP_SIZE);
  const first = days[0];
  const last = days[days.length - 1];
  const before = open.filter((day) => day < first);
  return {
    days,
    previous: before[before.length - 1] ?? null,
    next: open.find((day) => day > last) ?? null,
  };
}

const NAME = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const WEEKDAY_SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface DayLabel {
  name: string;
  /** Under the name, on a phone. */
  date: string;
  /** Alone, on a wide screen. */
  compact: string;
}

export function dayLabel(day: string, today: string): DayLabel {
  const at = new Date(`${day}T12:00:00Z`);
  const date = SHORT.format(at);
  const weekdayShort = WEEKDAY_SHORT.format(at);
  if (day === today)
    return { name: "Aujourd'hui", date: `${weekdayShort} ${date}`, compact: "Aujourd'hui" };
  if (day === addDays(today, 1))
    return { name: 'Demain', date: `${weekdayShort} ${date}`, compact: 'Demain' };
  return {
    name: capitalized(NAME.format(at)),
    date,
    compact: `${capitalized(weekdayShort)} ${at.getUTCDate()}`,
  };
}

const LONG = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "mardi 13 octobre". */
export function longDay(day: string): string {
  return LONG.format(new Date(`${day}T12:00:00Z`));
}
