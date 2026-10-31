import { addDays } from '@/lib/date-utils';
import type { PageKind } from '@/lib/telemetry';

export function visitKind(fromScreen: boolean, date: string, today: string): PageKind {
  if (fromScreen) return 'screen_qr';
  if (date === today) return 'today';
  return date === addDays(today, 1) ? 'tomorrow' : 'day';
}
