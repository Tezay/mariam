import { describe, it, expect } from 'vitest';
import { canCompare, isAscending, nextSort } from '@/features/catalog/rules';

describe('isAscending', () => {
  it('reads names A to Z and measures best-first by default', () => {
    expect(isAscending('name', null)).toBe(true);
    expect(isAscending('usage', null)).toBe(false);
    expect(isAscending('score', null)).toBe(false);
  });

  it('follows an explicit direction whatever the criterion', () => {
    expect(isAscending('name', 'desc')).toBe(false);
    expect(isAscending('usage', 'asc')).toBe(true);
  });
});

describe('nextSort', () => {
  it('flips the direction when the active criterion is picked again', () => {
    expect(nextSort({ sort: 'usage', order: null }, 'usage')).toEqual({ order: 'asc' });
    expect(nextSort({ sort: 'usage', order: 'asc' }, 'usage')).toEqual({ order: 'desc' });
    expect(nextSort({ sort: 'name', order: null }, 'name')).toEqual({ order: 'desc' });
  });

  it('starts another criterion at its own default', () => {
    expect(nextSort({ sort: 'usage', order: 'asc' }, 'name')).toEqual({
      sort: 'name',
      order: null,
    });
  });
});

describe('canCompare', () => {
  it('allows two or three dishes only', () => {
    expect([0, 1, 2, 3, 4].map(canCompare)).toEqual([false, false, true, true, false]);
  });
});
