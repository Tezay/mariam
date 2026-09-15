import { describe, it, expect } from 'vitest';
import { stepsFor, TOUR_FLAGS } from '@/features/tour/steps';

const targets = (tour: Parameters<typeof stepsFor>[0], mobile: boolean, canSeeStats = true) =>
  stepsFor(tour, { mobile, canSeeStats }).map((step) => String(step.target));

describe('stepsFor', () => {
  it('aims at the sidebar on a wide screen', () => {
    expect(targets('orientation', false).every((target) => !target.includes('nav-mobile'))).toBe(
      true
    );
    expect(targets('orientation', false)).toContain('[data-tour="nav"]');
  });

  it('aims at the bottom bar on a phone', () => {
    expect(targets('orientation', true).every((target) => !target.includes('"nav"'))).toBe(true);
    expect(targets('orientation', true)).toContain('[data-tour="nav-mobile"]');
  });

  it('scopes navigation links to the bar it shows', () => {
    expect(targets('orientation', false)).toContain('[data-tour="nav"] a[href="/admin/service"]');
    expect(targets('orientation', true)).toContain(
      '[data-tour="nav-mobile"] a[href="/admin/service"]'
    );
  });

  it('gives the same steps to both layouts of the statistics tour', () => {
    expect(targets('stats', true)).toEqual(targets('stats', false));
  });

  it('drops the statistics step for an account without the page', () => {
    const withStats = targets('orientation', false);
    const without = targets('orientation', false, false);
    expect(withStats).toContain('[data-tour="nav"] a[href="/admin/stats"]');
    expect(without).not.toContain('[data-tour="nav"] a[href="/admin/stats"]');
    expect(without).toHaveLength(withStats.length - 1);
  });

  it('centres the publish step on a phone, which opens the day view', () => {
    const publish = stepsFor('orientation', { mobile: true, canSeeStats: true }).find(
      (step) => step.title === 'Publier'
    );
    expect(publish?.target).toBe('body');
    expect(publish?.placement).toBe('center');
  });

  it('resolves the publish toggle itself on a wide screen', () => {
    const publish = stepsFor('orientation', { mobile: false, canSeeStats: true }).find(
      (step) => step.title === 'Publier'
    );
    expect(typeof publish?.target).toBe('function');
    expect(publish?.placement).not.toBe('center');
  });

  it('keeps the catalogue tour to the toolbar and one dish', () => {
    expect(stepsFor('catalog', { mobile: false, canSeeStats: true })).toHaveLength(2);
  });

  it('records each tour under its own flag', () => {
    expect(new Set(Object.values(TOUR_FLAGS)).size).toBe(3);
  });
});
