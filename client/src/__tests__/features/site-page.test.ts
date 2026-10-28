import { describe, it, expect } from 'vitest';
import type { Closure } from '@/lib/api/closures';
import { addressLines, directionsUrl } from '@/pages/public/site/address';
import { dayLabel, dayStrip, openDays } from '@/pages/public/site/days';

// Monday 12 to Friday 30 October 2026.
const WINDOW = { from: '2026-10-12', to: '2026-10-30' };
const WEEKDAYS = [0, 1, 2, 3, 4];

function closure(start_date: string, end_date: string): Closure {
  return { id: 1, start_date, end_date, reason: null, description: null };
}

describe('openDays', () => {
  it('keeps the service days of the window', () => {
    const days = openDays({ from: '2026-10-19', to: '2026-10-26' }, WEEKDAYS, []);
    expect(days).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-26',
    ]);
  });

  it('skips an announced closure', () => {
    const days = openDays({ from: '2026-10-19', to: '2026-10-23' }, WEEKDAYS, [
      closure('2026-10-21', '2026-10-22'),
    ]);
    expect(days).toEqual(['2026-10-19', '2026-10-20', '2026-10-23']);
  });

  it('opens every day of a site without service days set', () => {
    expect(openDays({ from: '2026-10-24', to: '2026-10-25' }, [], [])).toHaveLength(2);
  });
});

describe('dayStrip', () => {
  const open = openDays(WINDOW, WEEKDAYS, []);

  it('starts from today, with the open days before and after it', () => {
    expect(dayStrip(open, '2026-10-20', '2026-10-20')).toEqual({
      days: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
      previous: '2026-10-19',
      next: '2026-10-26',
    });
  });

  it('keeps today in the strip when the chosen day is among its next days', () => {
    expect(dayStrip(open, '2026-10-20', '2026-10-23').days[0]).toBe('2026-10-20');
  });

  it('starts from the chosen day further on, or in the past', () => {
    expect(dayStrip(open, '2026-10-20', '2026-10-27').days[0]).toBe('2026-10-27');
    expect(dayStrip(open, '2026-10-20', '2026-10-13')).toMatchObject({
      days: ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
      previous: '2026-10-12',
    });
  });

  it('shows a closed today, and stops at the edges of the window', () => {
    const strip = dayStrip(open, '2026-10-24', '2026-10-24');
    expect(strip.days).toEqual(['2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28']);
    expect(dayStrip(open, '2026-10-12', '2026-10-12').previous).toBeNull();
    expect(dayStrip(open, '2026-10-12', '2026-10-28').next).toBeNull();
  });
});

describe('dayLabel', () => {
  it('names today and tomorrow, and the weekday beyond', () => {
    expect(dayLabel('2026-10-20', '2026-10-20')).toEqual({
      name: "Aujourd'hui",
      date: 'mar. 20 oct.',
      compact: "Aujourd'hui",
    });
    expect(dayLabel('2026-10-21', '2026-10-20').name).toBe('Demain');
    expect(dayLabel('2026-10-22', '2026-10-20')).toEqual({
      name: 'Jeudi',
      date: '22 oct.',
      compact: 'Jeu. 22',
    });
  });
});

describe('the address of a site', () => {
  const address = {
    address_label: "1 place de l'Université 94000 Créteil",
    address_postcode: '94000',
    address_city: 'Créteil',
  };

  it('takes its postcode and city to a line of their own', () => {
    expect(addressLines(address)).toEqual({
      street: "1 place de l'Université",
      locality: '94000 Créteil',
    });
    expect(addressLines({ ...address, address_city: null, address_postcode: null })).toEqual({
      street: address.address_label,
      locality: '',
    });
  });

  it('leads the directions to its coordinates, else to its address', () => {
    expect(directionsUrl({ ...address, address_lat: 48.79, address_lon: 2.45 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=48.79%2C2.45'
    );
    expect(directionsUrl(address)).toContain(encodeURIComponent(address.address_label));
    expect(directionsUrl({ ...address, address_label: null })).toBeNull();
  });
});
