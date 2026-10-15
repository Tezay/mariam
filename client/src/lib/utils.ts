import { clsx, type ClassValue } from 'clsx';
import { parisNow } from './date-utils';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** JS getDay() is Sunday-first; the backend indexes weekdays from Monday. */
export function backendWeekday(date = parisNow()): number {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

export function isInServiceHours(
  serviceHours: Record<string, { open: string; close: string }>,
  now = parisNow()
): boolean {
  const slot = serviceHours[String(backendWeekday(now))];
  if (!slot) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = slot.open.split(':').map(Number);
  const [ch, cm] = slot.close.split(':').map(Number);
  return cur >= oh * 60 + om && cur <= ch * 60 + cm;
}
