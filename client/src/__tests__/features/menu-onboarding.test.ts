import { describe, it, expect } from 'vitest';
import type { MenuCategory } from '@/lib/api/categories';
import { buildCatGroups } from '@/pages/admin/calendar/day/onboarding/types';

function category(id: number, label: string, extra: Partial<MenuCategory> = {}): MenuCategory {
  return {
    id,
    parent_id: null,
    label,
    order: 0,
    is_protected: false,
    is_highlighted: false,
    ...extra,
  };
}

describe('buildCatGroups', () => {
  it('hands a parent step over to its leaves, highlighted or not', () => {
    const entrees = category(6, 'Entrées', {
      subcategories: [
        category(7, 'Froides', { parent_id: 6 }),
        category(8, 'Chaudes', { parent_id: 6 }),
      ],
    });

    expect(buildCatGroups([entrees]).map((g) => g.catId)).toEqual([7, 8]);
  });

  it('keeps a highlighted leaf as a step of its own', () => {
    const plat = category(9, 'Plat principal', { is_highlighted: true });

    expect(buildCatGroups([plat]).map((g) => g.catId)).toEqual([9]);
  });

  it('carries the parent label for the breadcrumb', () => {
    const desserts = category(15, 'Desserts', {
      subcategories: [category(16, 'Pâtisseries', { parent_id: 15 })],
    });

    expect(buildCatGroups([desserts])[0].parentLabel).toBe('Desserts');
  });
});
