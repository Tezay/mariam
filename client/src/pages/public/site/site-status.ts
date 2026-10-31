import type { Closure } from '@/lib/api/closures';
import { getServiceStatus } from '@/lib/service-utils';
import type { RestaurantPublic } from '../menu-types';

export interface SiteStatus {
  label: string;
  tone: 'ok' | 'soon' | 'subtle' | 'danger';
  full: boolean;
}

const STATUS_TONES = { green: 'ok', amber: 'soon', gray: 'subtle' } as const;

export function siteStatus(
  site: RestaurantPublic,
  closure: Closure | null,
  now: Date,
  capacityReached: boolean
): SiteStatus | null {
  if (closure) {
    return {
      label: `Fermé · ${closure.reason ?? 'fermeture exceptionnelle'}`,
      tone: 'danger',
      full: false,
    };
  }
  if (site.service_days.length === 0) return null;
  const status = getServiceStatus(site.service_hours, site.service_days, now);
  if (status.isOpen && capacityReached) {
    return { label: 'Ouvert · capacité atteinte', tone: 'danger', full: true };
  }
  return { label: status.label, tone: STATUS_TONES[status.color], full: false };
}
