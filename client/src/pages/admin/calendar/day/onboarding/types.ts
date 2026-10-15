import type { MenuCategory } from '@/lib/api/categories';
import type { DietaryTag, CertificationItem } from '@/lib/api/taxonomy';

/** Only leaves carry dishes, so a category with subcategories gives its place to them. */
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

/** A dish not yet created in the catalog. */
export interface PendingDish {
  name: string;
  tags: DietaryTag[];
  certifications: CertificationItem[];
}

export interface TagConfig {
  dietary_tags: DietaryTag[];
  certifications: CertificationItem[];
}

export function buildCatGroups(topCategories: MenuCategory[]): CatGroup[] {
  const groups: CatGroup[] = [];
  for (const cat of topCategories) {
    if ((cat.subcategories?.length ?? 0) > 0) {
      for (const sub of cat.subcategories!) {
        groups.push({ category: sub, parentLabel: cat.label, catId: sub.id });
      }
    } else {
      groups.push({ category: cat, catId: cat.id });
    }
  }
  return groups;
}
