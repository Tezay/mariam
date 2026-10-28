import type { DisplayCategory, MenuItemData, CategorySubstitutionData } from '../menu-types';
import { getCategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';
import { ItemCard } from './ItemCard';
import { SECTION_LABEL, SECTION_RULE, sectionColors } from './section-colors';
import { StandardCategory } from './StandardCategory';

interface HighlightedCategoryProps {
  category: DisplayCategory;
  onItemTap: (item: MenuItemData) => void;
  subColorBaseIndex?: number;
  substitutions?: Record<string, CategorySubstitutionData[]>;
}

function substitutionCards(
  category: DisplayCategory,
  substitutions?: Record<string, CategorySubstitutionData[]>
): MenuItemData[] {
  const items = category.items ?? [];
  if (!items.some((i) => i.is_out_of_stock)) return [];
  return (substitutions?.[category.id] ?? []).map((s) => ({
    dish: s.dish,
    category_id: category.id,
    is_out_of_stock: false,
  }));
}

const HIGHLIGHTED_GRID =
  'flex flex-col gap-3.5 px-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] lg:gap-x-5 lg:gap-y-[18px] lg:px-0';

export function HighlightedCategory({
  category,
  onItemTap,
  subColorBaseIndex = 0,
  substitutions,
}: HighlightedCategoryProps) {
  const hasSubcategories = category.subcategories && category.subcategories.length > 0;
  const color = getCategoryColor(category.color_key, 0);
  const headerLabel = hasSubcategories ? 'text-site-brand' : SECTION_LABEL;
  const headerRule = hasSubcategories ? 'bg-site-brand/25' : SECTION_RULE;

  const directItems = category.items ?? [];
  const directSubs = substitutionCards(category, substitutions);

  return (
    <div className="mb-2" style={sectionColors(color)}>
      <div className="mb-4 flex items-center gap-3 px-4 lg:px-0">
        <div className={cn('h-px flex-1', headerRule)} />
        <h3 className={cn('text-sm font-bold uppercase tracking-widest', headerLabel)}>
          {category.label}
        </h3>
        <div className={cn('h-px flex-1', headerRule)} />
      </div>

      {(directItems.length > 0 || directSubs.length > 0) && (
        <div className={cn('mb-4', HIGHLIGHTED_GRID)}>
          {directItems.map((item, index) => (
            <ItemCard
              key={item.id ?? item.dish?.name}
              item={item}
              categoryColor={color}
              isHighlighted
              imagePosition={index % 2 === 0 ? 'right' : 'left'}
              onTap={() => onItemTap(item)}
            />
          ))}
          {directSubs.map((item, i) => (
            <ItemCard
              key={`sub-${item.dish?.id ?? i}`}
              item={item}
              categoryColor={color}
              isHighlighted
              isNew
              imagePosition={(directItems.length + i) % 2 === 0 ? 'right' : 'left'}
              onTap={() => onItemTap(item)}
            />
          ))}
        </div>
      )}

      {hasSubcategories &&
        category.subcategories!.map((sub, subIndex) => {
          const subColor = getCategoryColor(sub.color_key, subColorBaseIndex + subIndex);
          const items = sub.items ?? [];

          if (sub.is_highlighted) {
            const subSubs = substitutionCards(sub, substitutions);
            if (items.length === 0 && subSubs.length === 0) return null;
            return (
              <div key={sub.id} className="mb-4" style={sectionColors(subColor)}>
                {subIndex > 0 && (
                  <p
                    className={cn(
                      'mb-3 px-4 text-xs font-semibold uppercase tracking-wider opacity-70 lg:px-0',
                      SECTION_LABEL
                    )}
                  >
                    {sub.label}
                  </p>
                )}
                <div className={HIGHLIGHTED_GRID}>
                  {items.map((item, index) => (
                    <ItemCard
                      key={item.id ?? item.dish?.name}
                      item={item}
                      categoryColor={subColor}
                      isHighlighted
                      imagePosition={index % 2 === 0 ? 'right' : 'left'}
                      onTap={() => onItemTap(item)}
                    />
                  ))}
                  {subSubs.map((item, i) => (
                    <ItemCard
                      key={`sub-${item.dish?.id ?? i}`}
                      item={item}
                      categoryColor={subColor}
                      isHighlighted
                      isNew
                      imagePosition={(items.length + i) % 2 === 0 ? 'right' : 'left'}
                      onTap={() => onItemTap(item)}
                    />
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={sub.id} className="mb-4">
              <StandardCategory
                category={sub}
                color={subColor}
                onItemTap={onItemTap}
                hideHeader={subIndex === 0}
                substitutions={substitutions}
              />
            </div>
          );
        })}
    </div>
  );
}
