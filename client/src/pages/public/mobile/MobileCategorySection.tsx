import type { DisplayCategory, MenuItemData, CategorySubstitutionData } from '../menu-types';
import { getCategoryColor } from '@/lib/category-colors';
import { MobileStandardCategory } from './MobileStandardCategory';
import { MobileHighlightedCategory } from './MobileHighlightedCategory';

interface MobileCategorySectionProps {
  categories: DisplayCategory[];
  onItemTap: (item: MenuItemData) => void;
  substitutions?: Record<string, CategorySubstitutionData[]>;
}

export function MobileCategorySection({
  categories,
  onItemTap,
  substitutions,
}: MobileCategorySectionProps) {
  let standardColorIndex = 0;

  return (
    <div className="flex flex-col gap-6 py-4">
      {categories.map((category) => {
        const hasItems = (category.items ?? []).length > 0;
        const hasSubs = (category.subcategories ?? []).some((s) => (s.items ?? []).length > 0);
        if (!hasItems && !hasSubs) return null;

        if (category.is_highlighted || (category.subcategories?.length ?? 0) > 0) {
          const result = (
            <MobileHighlightedCategory
              key={category.id}
              category={category}
              onItemTap={onItemTap}
              subColorBaseIndex={standardColorIndex}
              substitutions={substitutions}
            />
          );
          // Its standard subcategories take palette colours too.
          const nonHighlightSubs = (category.subcategories ?? []).filter((s) => !s.is_highlighted);
          standardColorIndex += nonHighlightSubs.length;
          return result;
        }

        const color = getCategoryColor(category.color_key, standardColorIndex);
        standardColorIndex += 1;

        return (
          <MobileStandardCategory
            key={category.id}
            category={category}
            color={color}
            onItemTap={onItemTap}
            substitutions={substitutions}
          />
        );
      })}
    </div>
  );
}
