export interface ServiceHourEntry {
    open: string;  // "HH:MM"
    close: string; // "HH:MM"
}

export interface ServiceStatus {
    label: string;
    isOpen: boolean;
    color: 'green' | 'amber' | 'gray';
}

/** Convertit un index JS (0=Dimanche) en index MARIAM (0=Lundi) */
export function jsDayToMariamDay(jsDay: number): number {
    // JS: 0=Sun, 1=Mon, ..., 6=Sat
    // MARIAM: 0=Mon, ..., 4=Fri, 5=Sat, 6=Sun
    return jsDay === 0 ? 6 : jsDay - 1;
}

function parseTime(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Calcule le statut d'ouverture du restaurant.
 * @param serviceHours - Map de { "day_of_week": { open, close } } (clés = strings)
 * @param serviceDays  - Liste des jours d'ouverture (0=Lun..6=Dim)
 */
export function getServiceStatus(
    serviceHours: Record<string, ServiceHourEntry>,
    serviceDays: number[]
): ServiceStatus {
    const now = new Date();
    const mariamDay = jsDayToMariamDay(now.getDay());
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Le restaurant n'est pas ouvert ce jour
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

/** Formatte un index de jour MARIAM en abréviation FR */
export function mariamDayLabel(day: number): string {
    const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    return labels[day] ?? '';
}

/** Formatte un horaire "HH:MM" en "HHhMM" (ex: "11:30" -> "11h30") */
export function formatTime(hhmm: string): string {
    return hhmm.replace(':', 'h');
}

export interface GroupedHourEntry {
    days: string;  // ex: "Lun–Ven" ou "Sam"
    hours: string; // ex: "11h30–14h00"
}

/**
 * Regroupe les jours consécutifs ayant les mêmes horaires.
 * Ex: Lun/Mar/Mer/Jeu/Ven tous à 11:30-14:00 -> "Lun–Ven : 11h30–14h00"
 */
export function groupConsecutiveHours(
    serviceHours: Record<string, ServiceHourEntry>,
    serviceDays: number[]
): GroupedHourEntry[] {
    const active = serviceDays
        .filter(d => serviceHours[String(d)])
        .sort((a, b) => a - b)
        .map(d => ({ day: d, open: serviceHours[String(d)].open, close: serviceHours[String(d)].close }));

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
            const daysLabel = first.day === last.day
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

import type { ExceptionalClosure } from './api';

/**
 * Retourne la fermeture exceptionnelle active pour une date donnée (YYYY-MM-DD), ou null.
 * Ne prend en compte que les fermetures publiées et actives.
 */
export function getActiveClosureForDate(
    closures: ExceptionalClosure[],
    dateISO: string,
): ExceptionalClosure | null {
    return closures.find(
        c => c.is_active && c.start_date <= dateISO && c.end_date >= dateISO
    ) ?? null;
}

export interface NextOpeningDate {
    /** Abréviation + date courte : "Lun 7 avr." */
    label: string;
}

/**
 * Retourne la prochaine date d'ouverture à partir de demain.
 * Retourne null si aucun jour d'ouverture n'est défini.
 */
export function getNextOpeningDate(serviceDays: number[]): NextOpeningDate | null {
    if (serviceDays.length === 0) return null;

    for (let offset = 1; offset <= 7; offset++) {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const mariamDay = jsDayToMariamDay(d.getDay());
        if (serviceDays.includes(mariamDay)) {
            const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
            return { label };
        }
    }
    return null;
}
