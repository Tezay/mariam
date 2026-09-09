import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  addDays,
  formatParisTime,
  parisDayOfWeek,
  parisNow,
  parisToday,
  parisYear,
} from '@/lib/date-utils';

describe('parisToday', () => {
  it('returns a valid YYYY-MM-DD string', () => {
    const result = parisToday();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a date within one day of UTC now', () => {
    const result = parisToday();
    const utcDate = new Date().toISOString().split('T')[0];
    const diff = Math.abs(new Date(result).getTime() - new Date(utcDate).getTime());
    // Paris is UTC+1 or UTC+2, so diff is at most 1 day
    expect(diff).toBeLessThanOrEqual(86_400_000);
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2024-01-01', 1)).toBe('2024-01-02');
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('subtracts days with negative input', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // 2024 is leap year
  });

  it('adds zero days returns same date', () => {
    expect(addDays('2024-06-15', 0)).toBe('2024-06-15');
  });

  it('adds 7 days correctly across month boundary', () => {
    expect(addDays('2024-01-28', 7)).toBe('2024-02-04');
  });
});

describe('the Paris clock is independent of the machine', () => {
  afterEach(() => vi.useRealTimers());

  /** 23:30 UTC on a Sunday is already Monday 01:30 in Paris. */
  function freezeLateSunday() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T23:30:00Z'));
  }

  it("rolls the day over on Paris time, not on the viewer's", () => {
    freezeLateSunday();
    expect(parisToday()).toBe('2026-09-07');
    expect(parisDayOfWeek()).toBe(1);
  });

  it('reads the hour in Paris', () => {
    freezeLateSunday();
    expect(parisNow().getHours()).toBe(1);
    expect(parisYear()).toBe(2026);
  });

  it('formats an instant as Paris wall-clock', () => {
    expect(formatParisTime(new Date('2026-09-06T23:30:00Z'))).toBe('01:30');
  });
});
