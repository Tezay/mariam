import type { MenuCategory } from '@/lib/api';

/** Only leaves carry dishes; a category with subcategories groups them. */
export function leafCategories(categories: MenuCategory[]): MenuCategory[] {
  return categories.flatMap((category) =>
    category.subcategories?.length ? category.subcategories : [category]
  );
}

export interface CategoryPath {
  leaf: MenuCategory;
  parent?: MenuCategory;
}

export function categoryPath(
  categories: MenuCategory[],
  categoryId: number | null | undefined
): CategoryPath | null {
  if (!categoryId) return null;
  for (const category of categories) {
    if (category.id === categoryId) return { leaf: category };
    const child = category.subcategories?.find((sub) => sub.id === categoryId);
    if (child) return { leaf: child, parent: category };
  }
  return null;
}

export function pathLabel(path: CategoryPath | null): string {
  if (!path) return 'Sans catégorie';
  return path.parent ? `${path.parent.label} › ${path.leaf.label}` : path.leaf.label;
}
