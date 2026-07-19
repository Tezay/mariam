import { describe, it, expect } from 'vitest';
import { parisToday, addDays } from '@/lib/date-utils';

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
