import { MenuCategory } from '@/lib/api/categories';

/** Each parent followed by its subcategories. */
export function flattenCategories(cats: MenuCategory[]): MenuCategory[] {
  const result: MenuCategory[] = [];
  for (const cat of cats) {
    result.push(cat);
    if (cat.subcategories?.length) result.push(...flattenCategories(cat.subcategories));
  }
  return result;
}

/** The categories that may hold dishes. */
export function leafCategories(cats: MenuCategory[]): MenuCategory[] {
  const result: MenuCategory[] = [];
  for (const cat of cats) {
    if ((cat.subcategories?.length ?? 0) === 0) {
      result.push(cat);
    } else {
      result.push(...(cat.subcategories ?? []));
    }
  }
  return result;
}
