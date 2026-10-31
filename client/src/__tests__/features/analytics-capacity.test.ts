import { describe, expect, it } from 'vitest';
import { capacityReachedLine } from '@/features/analytics/format';

describe('capacityReachedLine', () => {
  it('says nothing while no service was full', () => {
    expect(capacityReachedLine({ services: 0, sites: 0, usual_time: null })).toBeNull();
  });

  it('gives the hour of a single full service', () => {
    expect(capacityReachedLine({ services: 1, sites: 1, usual_time: '12:10' })).toBe(
      "Capacité maximale atteinte lors d'un service, à 12h10."
    );
  });

  it('gives the usual hour, and the sites of an organization', () => {
    expect(capacityReachedLine({ services: 6, sites: 2, usual_time: '12:05' })).toBe(
      'Capacité maximale atteinte lors de 6 services, sur 2 sites, vers 12h05 en général.'
    );
  });
});
