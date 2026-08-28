export const PLACEHOLDER = '—';

const numberFormatter = new Intl.NumberFormat('fr-FR');

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return PLACEHOLDER;
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined) return PLACEHOLDER;
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Rate deltas read as percentage points, not as a relative change. */
export function formatPoints(delta: number | null | undefined): string | null {
  if (delta === null || delta === undefined || delta === 0) return null;
  const points = delta * 100;
  const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(points);
  return `${points > 0 ? '+' : ''}${formatted} pts`;
}

/** Unsigned duration; lead time carries its direction in a separate label. */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return PLACEHOLDER;
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours >= 24) {
    return `${Math.floor(wholeHours / 24)} j ${wholeHours % 24} h`;
  }
  if (minutes === 0) return `${wholeHours} h`;
  return `${wholeHours} h ${String(minutes).padStart(2, '0')}`;
}

/** A negative lead time means the menu went out after the service opened. */
export function isLate(hours: number | null | undefined): boolean {
  return hours !== null && hours !== undefined && hours < 0;
}

export function leadTimeLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '';
  return isLate(hours) ? "après l'ouverture" : "avant l'ouverture";
}

export function formatLeadTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return PLACEHOLDER;
  return `${formatDuration(hours)} ${isLate(hours) ? 'après' : 'avant'}`;
}

export function formatDayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
    new Date(year, month - 1, day)
  );
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return PLACEHOLDER;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return PLACEHOLDER;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}
