import type { DisplayCategory, MenuItemData, CategorySubstitutionData } from '../menu-types';
import type { CategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';
import { ItemCard } from './ItemCard';
import { SECTION_LABEL, SECTION_RULE, sectionColors } from './section-colors';

interface StandardCategoryProps {
  category: DisplayCategory;
  color: CategoryColor;
  onItemTap: (item: MenuItemData) => void;
  hideHeader?: boolean;
  substitutions?: Record<string, CategorySubstitutionData[]>;
}

/** With an odd count, the longest name goes last, where it spans the row. */
function reorderForGrid(items: MenuItemData[]): MenuItemData[] {
  if (items.length % 2 === 0) return items;
  let longestIdx = 0;
  for (let i = 1; i < items.length; i++) {
    if ((items[i].dish?.name?.length ?? 0) > (items[longestIdx].dish?.name?.length ?? 0)) {
      longestIdx = i;
    }
  }
  const reordered = [...items];
  const [longest] = reordered.splice(longestIdx, 1);
  reordered.push(longest);
  return reordered;
}

export function StandardCategory({
  category,
  color,
  onItemTap,
  hideHeader = false,
  substitutions,
}: StandardCategoryProps) {
  const items = category.items ?? [];
  if (items.length === 0) return null;

  const orderedItems = reorderForGrid(items);

  const oosPresent = items.some((i) => i.is_out_of_stock);
  const subCards: MenuItemData[] = oosPresent
    ? (substitutions?.[category.id] ?? []).map((s) => ({
        dish: s.dish,
        category_id: category.id,
        is_out_of_stock: false,
      }))
    : [];

  const total = orderedItems.length + subCards.length;
  const isOdd = total % 2 === 1;

  return (
    <div className="mb-1" style={sectionColors(color)}>
      {!hideHeader && (
        <div className="mb-3 flex items-center gap-3 px-4 lg:px-0">
          <div className={cn('h-px flex-1', SECTION_RULE)} />
          <h3 className={cn('text-xs font-bold uppercase tracking-widest', SECTION_LABEL)}>
            {category.label}
          </h3>
          <div className={cn('h-px flex-1', SECTION_RULE)} />
        </div>
      )}

      {hideHeader && (
        <p
          className={cn(
            'mb-2 px-4 text-xs font-semibold uppercase tracking-wider lg:px-0',
            SECTION_LABEL
          )}
        >
          {category.label}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:gap-x-3.5 lg:gap-y-[18px] lg:px-0">
        {orderedItems.map((item, index) => (
          <div
            key={item.id ?? item.dish?.name}
            className={isOdd && index === total - 1 ? 'col-span-2 lg:col-span-1' : ''}
          >
            <ItemCard
              item={item}
              categoryColor={color}
              isHighlighted={false}
              onTap={() => onItemTap(item)}
            />
          </div>
        ))}
        {subCards.map((item, i) => {
          const index = orderedItems.length + i;
          return (
            <div
              key={`sub-${item.dish?.id ?? i}`}
              className={isOdd && index === total - 1 ? 'col-span-2 lg:col-span-1' : ''}
            >
              <ItemCard
                item={item}
                categoryColor={color}
                isHighlighted={false}
                isNew
                onTap={() => onItemTap(item)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
