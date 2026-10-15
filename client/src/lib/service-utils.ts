import { parisNow } from './date-utils';

export interface ServiceHourEntry {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export interface ServiceStatus {
  label: string;
  isOpen: boolean;
  color: 'green' | 'amber' | 'gray';
}

export function jsDayToMariamDay(jsDay: number): number {
  // JS: 0=Sun, 1=Mon, ..., 6=Sat
  // MARIAM: 0=Mon, ..., 4=Fri, 5=Sat, 6=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** `serviceHours` is keyed by weekday, as a string; weekdays count from 0 for Monday. */
export function getServiceStatus(
  serviceHours: Record<string, ServiceHourEntry>,
  serviceDays: number[]
): ServiceStatus {
  const now = parisNow();
  const mariamDay = jsDayToMariamDay(now.getDay());
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!serviceDays.includes(mariamDay)) {
    return { label: "Fermé aujourd'hui", isOpen: false, color: 'gray' };
  }

  const hours = serviceHours[String(mariamDay)];
  if (!hours) {
    return { label: "Fermé aujourd'hui", isOpen: false, color: 'gray' };
  }

  const openMinutes = parseTime(hours.open);
  const closeMinutes = parseTime(hours.close);
  const openLabel = hours.open.replace(':', 'h');
  const closeLabel = hours.close.replace(':', 'h');

  if (currentMinutes < openMinutes) {
    return { label: `Ouvre à ${openLabel}`, isOpen: false, color: 'amber' };
  }

  if (currentMinutes <= closeMinutes) {
    return { label: `Ouvert · ${openLabel}–${closeLabel}`, isOpen: true, color: 'green' };
  }

  return { label: "Fermé aujourd'hui", isOpen: false, color: 'gray' };
}

export function mariamDayLabel(day: number): string {
  const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  return labels[day] ?? '';
}

/** "11:30" becomes "11h30". */
export function formatTime(hhmm: string): string {
  return hhmm.replace(':', 'h');
}

export interface GroupedHourEntry {
  days: string; // "Lun–Ven" or "Sam"
  hours: string; // "11h30–14h00"
}

/** Monday to Friday at 11:30–14:00 become "Lun–Ven : 11h30–14h00". */
export function groupConsecutiveHours(
  serviceHours: Record<string, ServiceHourEntry>,
  serviceDays: number[]
): GroupedHourEntry[] {
  const active = serviceDays
    .filter((d) => serviceHours[String(d)])
    .sort((a, b) => a - b)
    .map((d) => ({
      day: d,
      open: serviceHours[String(d)].open,
      close: serviceHours[String(d)].close,
    }));

  if (active.length === 0) return [];

  const groups: GroupedHourEntry[] = [];
  let groupStart = 0;

  for (let i = 1; i <= active.length; i++) {
    const prev = active[i - 1];
    const curr = active[i];
    const sameHours = curr && curr.open === prev.open && curr.close === prev.close;
    const consecutive = curr && curr.day === prev.day + 1;

    if (!curr || !sameHours || !consecutive) {
      const first = active[groupStart];
      const last = active[i - 1];
      const daysLabel =
        first.day === last.day
          ? mariamDayLabel(first.day)
          : `${mariamDayLabel(first.day)}–${mariamDayLabel(last.day)}`;
      groups.push({
        days: daysLabel,
        hours: `${formatTime(first.open)}–${formatTime(first.close)}`,
      });
      groupStart = i;
    }
  }

  return groups;
}

export interface NextOpeningDate {
  /** "Lun 7 avr." */
  label: string;
}

/** From tomorrow on; null without any service day. */
export function getNextOpeningDate(serviceDays: number[]): NextOpeningDate | null {
  if (serviceDays.length === 0) return null;

  for (let offset = 1; offset <= 7; offset++) {
    const d = parisNow();
    d.setDate(d.getDate() + offset);
    const mariamDay = jsDayToMariamDay(d.getDay());
    if (serviceDays.includes(mariamDay)) {
      const label = d.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      return { label };
    }
  }
  return null;
}
