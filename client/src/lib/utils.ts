// Fonction utilitaire de Shadcn/ui
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Détermine si l'heure actuelle est dans la plage de service du jour.
 * @param serviceHours - Horaires indexés par jour (0=Lundi … 6=Dimanche, convention backend)
 * @param now - Date de référence (défaut : maintenant)
 */
/** JS getDay() is Sunday-first; the backend indexes weekdays from Monday. */
export function backendWeekday(date = new Date()): number {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

export function isInServiceHours(
  serviceHours: Record<string, { open: string; close: string }>,
  now = new Date()
): boolean {
  const slot = serviceHours[String(backendWeekday(now))];
  if (!slot) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = slot.open.split(':').map(Number);
  const [ch, cm] = slot.close.split(':').map(Number);
  return cur >= oh * 60 + om && cur <= ch * 60 + cm;
}
