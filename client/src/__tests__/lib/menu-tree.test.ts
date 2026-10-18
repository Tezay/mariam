import { describe, it, expect } from 'vitest';
import type { Menu, MenuItem } from '@/lib/api/menus';
import { menuItems, withItem } from '@/lib/menu-tree';

function item(id: number, categoryId: number): MenuItem {
  return {
    id,
    category_id: categoryId,
    dish: { id: id * 10, name: `Plat ${id}`, tags: [], certifications: [] },
    order: 0,
    is_out_of_stock: false,
  };
}

const menu: Menu = {
  date: '2026-10-19',
  images: [],
  substitutions: {},
  categories: [
    { id: 1, label: 'Entrées', is_highlighted: false, order: 0, items: [item(1, 1)] },
    {
      id: 2,
      label: 'Plats',
      is_highlighted: false,
      order: 1,
      subcategories: [
        { id: 3, label: 'Viandes', is_highlighted: false, order: 0, items: [item(2, 3)] },
        { id: 4, label: 'Poissons', is_highlighted: false, order: 1, items: [item(3, 4)] },
      ],
    },
  ],
};

describe('menuItems', () => {
  it('lists the items of every category and subcategory, in order', () => {
    expect(menuItems(menu).map((each) => each.id)).toEqual([1, 2, 3]);
  });
});

describe('withItem', () => {
  it('replaces the item of the same id, wherever it sits', () => {
    const updated = withItem(menu, { ...item(3, 4), is_out_of_stock: true });

    expect(menuItems(updated).map((each) => each.is_out_of_stock)).toEqual([false, false, true]);
    expect(menuItems(menu)[2].is_out_of_stock).toBe(false);
  });
});
