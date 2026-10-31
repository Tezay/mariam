import { describe, expect, it } from 'vitest';
import type { Quality } from '@/lib/api/quality';
import { formatShare, qualityView } from '@/pages/public/site/quality-view';

const MENUS = { days: 30, labelled: 40, homemade: 0, local: 25, seasonal: 10, vegetarian: null };

describe('qualityView', () => {
  it('leaves out the menu lines at zero or unknown', () => {
    const view = qualityView({ declaration: null, menus: MENUS, labels: [] }, null);

    expect(view?.menuLines.map((line) => line.label)).toEqual([
      'Plats portant un label',
      'Produits locaux',
      'Produits de saison',
    ]);
  });

  it('shows nothing when nothing is known', () => {
    const quality: Quality = { declaration: null, menus: null, labels: [] };

    expect(qualityView(quality, null)).toBeNull();
    expect(qualityView(null, '')).toBeNull();
  });

  it('shows the commitments alone', () => {
    expect(qualityView(null, 'Cuisine sur place.')?.commitments).toBe('Cuisine sur place.');
  });
});

describe('formatShare', () => {
  it('writes a share to the tenth, the French way', () => {
    expect(formatShare(38.3)).toBe('38,3 %');
    expect(formatShare(40)).toBe('40 %');
  });
});
