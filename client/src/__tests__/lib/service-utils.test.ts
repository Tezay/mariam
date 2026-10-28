import { describe, it, expect } from 'vitest';
import { getServiceStatus } from '@/lib/service-utils';

const weekdays = [0, 1, 2, 3, 4];
const hours = { '3': { open: '11:30', close: '14:00' } };

// Thursday 15 October 2026, in Paris (UTC+2).
const at = (time: string) => new Date(`2026-10-15T${time}+02:00`);

describe('getServiceStatus at a given instant', () => {
  it('announces the opening before the service', () => {
    expect(getServiceStatus(hours, weekdays, at('10:00:00')).label).toBe('Ouvre à 11h30');
  });

  it('is open during the service', () => {
    const status = getServiceStatus(hours, weekdays, at('12:00:00'));
    expect(status).toMatchObject({ label: 'Ouvert · 11h30–14h00', isOpen: true });
  });

  it('is closed after the service', () => {
    expect(getServiceStatus(hours, weekdays, at('15:00:00')).label).toBe("Fermé aujourd'hui");
  });
});
