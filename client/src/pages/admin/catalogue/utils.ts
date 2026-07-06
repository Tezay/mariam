import { MenuCategory } from '@/lib/api';

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

/**
 * Normalise un nom de plat : espaces compactés, première lettre en majuscule.
 * Miroir de `_capitalize_name` côté serveur (routes/catalog.py).
 */
export function normalizeDishName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase());
}
