import type { DisplayCategory, MenuItemData, CategorySubstitutionData } from '../menu-types';
import { getCategoryColor } from '@/lib/category-colors';
import { MobileItemCard } from './MobileItemCard';
import { MobileStandardCategory } from './MobileStandardCategory';

interface MobileHighlightedCategoryProps {
  category: DisplayCategory;
  onItemTap: (item: MenuItemData) => void;
  subColorBaseIndex?: number;
  /** Substitutions par category_id ; affichées si la catégorie a un item en rupture. */
  substitutions?: Record<string, CategorySubstitutionData[]>;
}

/** Cartes de substitution (plats « Nouveau ») pour une catégorie feuille dont un item est en rupture. */
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

export function MobileHighlightedCategory({
  category,
  onItemTap,
  subColorBaseIndex = 0,
  substitutions,
}: MobileHighlightedCategoryProps) {
  const hasSubcategories = category.subcategories && category.subcategories.length > 0;
  const color = getCategoryColor(category.color_key, 0);
  const headerTextColor = hasSubcategories ? '#093EAA' : color.sectionLabel;
  const headerLineColor = hasSubcategories ? '#C5D2F1' : color.sectionBorder;

  const directItems = category.items ?? [];
  const directSubs = substitutionCards(category, substitutions);

  return (
    <div className="mb-2">
      {/* Header de la catégorie principale */}
      <div className="mb-4 flex items-center gap-3 px-4">
        <div className="h-px flex-1" style={{ backgroundColor: headerLineColor }} />
        <span
          className="text-sm font-bold uppercase tracking-widest"
          style={{ color: headerTextColor }}
        >
          {category.label}
        </span>
        <div className="h-px flex-1" style={{ backgroundColor: headerLineColor }} />
      </div>

      {/* Items directs (+ substitutions) */}
      {(directItems.length > 0 || directSubs.length > 0) && (
        <div className="mb-4 flex flex-col gap-3 px-4">
          {directItems.map((item, index) => (
            <MobileItemCard
              key={item.id ?? item.dish?.name}
              item={item}
              categoryColor={color}
              isHighlighted
              imagePosition={index % 2 === 0 ? 'right' : 'left'}
              onTap={() => onItemTap(item)}
            />
          ))}
          {directSubs.map((item, i) => (
            <MobileItemCard
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

      {/* Sous-catégories */}
      {hasSubcategories &&
        category.subcategories!.map((sub, subIndex) => {
          const subColor = getCategoryColor(sub.color_key, subColorBaseIndex + subIndex);
          const items = sub.items ?? [];

          if (sub.is_highlighted) {
            const subSubs = substitutionCards(sub, substitutions);
            if (items.length === 0 && subSubs.length === 0) return null;
            return (
              <div key={sub.id} className="mb-4">
                {subIndex > 0 && (
                  <p
                    className="mb-3 px-4 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: subColor.sectionLabel + 'B3' }}
                  >
                    {sub.label}
                  </p>
                )}
                <div className="flex flex-col gap-3 px-4">
                  {items.map((item, index) => (
                    <MobileItemCard
                      key={item.id ?? item.dish?.name}
                      item={item}
                      categoryColor={subColor}
                      isHighlighted
                      imagePosition={index % 2 === 0 ? 'right' : 'left'}
                      onTap={() => onItemTap(item)}
                    />
                  ))}
                  {subSubs.map((item, i) => (
                    <MobileItemCard
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

          // Sous-catégorie non-highlight : grille 2 colonnes
          return (
            <div key={sub.id} className="mb-4">
              <MobileStandardCategory
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
