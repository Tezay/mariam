/**
 * Every date this product shows is a Paris date: the restaurants, their service
 * days and their menus all live there. The viewer's own timezone is never
 * consulted, so the dashboard reads the same from Créteil or from Montréal.
 *
 * This module is the only place allowed to call `new Date()` without arguments;
 * an ESLint rule enforces that.
 */
const PARIS_TZ = 'Europe/Paris';

/**
 * Returns the current date in Europe/Paris timezone as a YYYY-MM-DD string.
 */
export function parisToday(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: PARIS_TZ }).format(new Date());
}

/**
 * Day of week (0=Sunday..6=Saturday) for the current date in Europe/Paris,
 * independent of the viewer's own timezone.
 */
export function parisDayOfWeek(): number {
  return new Date(`${parisToday()}T12:00:00`).getDay();
}

/**
 * Adds `days` to an ISO date string (YYYY-MM-DD) and returns the result as YYYY-MM-DD.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Now, as a Date whose *local* getters return Paris wall-clock values.
 *
 * Use it for hour, weekday and year comparisons. The instant it represents is
 * shifted, so never send it to the API — send the formatted date instead.
 */
export function parisNow(): Date {
  const parts = new Intl.DateTimeFormat('sv', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
  return new Date(parts.replace(' ', 'T'));
}

/** Current year in Europe/Paris. */
export function parisYear(): number {
  return parisNow().getFullYear();
}

/** Wall-clock time of an instant, in Paris. */
export function formatParisTime(value: Date): string {
  return value.toLocaleTimeString('fr-FR', {
    timeZone: PARIS_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A true point in time, for durations and "last updated" stamps.
 *
 * Distinct from parisNow(): this one is the real instant and must not be used
 * to read a calendar day or an hour.
 */
export function nowInstant(): Date {
  return new Date();
}
