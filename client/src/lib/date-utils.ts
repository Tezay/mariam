const PARIS_TZ = 'Europe/Paris';

/**
 * Returns the current date in Europe/Paris timezone as a YYYY-MM-DD string.
 */
export function parisToday(): string {
    return new Intl.DateTimeFormat('sv', { timeZone: PARIS_TZ }).format(new Date());
}

/**
 * Adds `days` to an ISO date string (YYYY-MM-DD) and returns the result as YYYY-MM-DD.
 */
export function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}