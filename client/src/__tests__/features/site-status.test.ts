import { describe, expect, it } from 'vitest';
import type { Closure } from '@/lib/api/closures';
import type { RestaurantPublic } from '@/pages/public/menu-types';
import { siteStatus } from '@/pages/public/site/site-status';

const site = {
  service_days: [0, 1, 2, 3, 4],
  service_hours: { '4': { open: '11:30', close: '14:00' } },
} as unknown as RestaurantPublic;
const FRIDAY_NOON = new Date('2026-10-30T11:00:00Z');
const FRIDAY_EVENING = new Date('2026-10-30T18:00:00Z');

describe('siteStatus', () => {
  it('turns red while the service runs full', () => {
    expect(siteStatus(site, null, FRIDAY_NOON, true)).toEqual({
      label: 'Ouvert · capacité atteinte',
      tone: 'danger',
      full: true,
    });
  });

  it('keeps the opening hours while there is room', () => {
    expect(siteStatus(site, null, FRIDAY_NOON, false)?.label).toBe('Ouvert · 11h30–14h00');
  });

  it('forgets a full service once the restaurant has closed', () => {
    expect(siteStatus(site, null, FRIDAY_EVENING, true)?.full).toBe(false);
  });

  it('puts a closure first', () => {
    const closure = { reason: 'Travaux' } as Closure;

    expect(siteStatus(site, closure, FRIDAY_NOON, true)?.label).toBe('Fermé · Travaux');
  });
});
