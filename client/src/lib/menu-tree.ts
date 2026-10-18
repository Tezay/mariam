import type { Menu, MenuItem } from '@/lib/api/menus';

/** A menu's items, category after category, as the editor lists them. */
export function menuItems(menu: Pick<Menu, 'categories'>): MenuItem[] {
  return menu.categories.flatMap((category) => [
    ...(category.items ?? []),
    ...(category.subcategories ?? []).flatMap((sub) => sub.items ?? []),
  ]);
}

export function withItem(menu: Menu, item: MenuItem): Menu {
  const swap = (items?: MenuItem[]) => items?.map((each) => (each.id === item.id ? item : each));
  return {
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      items: swap(category.items),
      subcategories: category.subcategories?.map((sub) => ({ ...sub, items: swap(sub.items) })),
    })),
  };
}
