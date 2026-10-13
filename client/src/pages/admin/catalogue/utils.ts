import { MenuCategory } from '@/lib/api/categories';

/** Aplatit l'arbre de catégories (parents suivis de leurs sous-catégories). */
export function flattenCategories(cats: MenuCategory[]): MenuCategory[] {
  const result: MenuCategory[] = [];
  for (const cat of cats) {
    result.push(cat);
    if (cat.subcategories?.length) result.push(...flattenCategories(cat.subcategories));
  }
  return result;
}

/** Catégories feuilles uniquement (celles qui peuvent contenir des plats). */
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
