import type { MenuCategory, DietaryTag, CertificationItem } from '@/lib/api';

/** Catégorie "aplatie" parcourue par le wizard (les sous-catégories des
 *  catégories mises en avant deviennent des groupes à part entière). */
export interface CatGroup {
  category: MenuCategory;
  parentLabel?: string;
  catId: number;
}

export type CategorySubStep = 'pick' | 'tags' | 'photo' | 'added' | 'substitutions';

export type OnboardingStep =
  | { kind: 'category'; groupIdx: number; sub: CategorySubStep }
  | { kind: 'chef-note' }
  | { kind: 'celebration' };

/** Nouveau plat en cours de qualification (avant création au catalogue). */
export interface PendingDish {
  name: string;
  tags: DietaryTag[];
  certifications: CertificationItem[];
}

/** Tags et certifications configurés pour le restaurant. */
export interface TagConfig {
  dietary_tags: DietaryTag[];
  certifications: CertificationItem[];
}

export function buildCatGroups(topCategories: MenuCategory[]): CatGroup[] {
  const groups: CatGroup[] = [];
  for (const cat of topCategories) {
    if (cat.is_highlighted && (cat.subcategories?.length ?? 0) > 0) {
      for (const sub of cat.subcategories!) {
        groups.push({ category: sub, parentLabel: cat.label, catId: sub.id });
      }
    } else {
      groups.push({ category: cat, catId: cat.id });
    }
  }
  return groups;
}
