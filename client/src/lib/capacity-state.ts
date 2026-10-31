import { formatParisTime } from './date-utils';

export type CapacityState = 'available' | 'reached' | 'idle';

export function capacityState(reached: boolean | null, inService: boolean): CapacityState {
  if (!inService || reached === null) return 'idle';
  return reached ? 'reached' : 'available';
}

export function capacityText(capacity: number, state: CapacityState, reachedAt: string | null) {
  const meals = `${capacity.toLocaleString('fr-FR')} repas par service`;
  const since = reachedAt && `Depuis ${formatParisTime(new Date(reachedAt)).replace(':', 'h')}`;
  return {
    available: { title: 'Places disponibles', lead: 'Capacité maximale', tail: meals },
    reached: { title: 'Capacité atteinte', lead: since || null, tail: meals },
    idle: { title: meals, lead: 'Capacité maximale', tail: null },
  }[state];
}
