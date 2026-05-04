import type { DisplayCategory, MenuItemData } from '../menu-types';
import { getCategoryColor } from '@/lib/category-colors';
import { MobileItemCard } from './MobileItemCard';
import { MobileStandardCategory } from './MobileStandardCategory';

interface MobileHighlightedCategoryProps {
    category: DisplayCategory;
    onItemTap: (item: MenuItemData) => void;
    subColorBaseIndex?: number;
}

export function MobileHighlightedCategory({ category, onItemTap, subColorBaseIndex = 0 }: MobileHighlightedCategoryProps) {
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;
    const color = getCategoryColor(category.color_key, 0);
    const headerTextColor = hasSubcategories ? '#093EAA' : color.sectionLabel;
    const headerLineColor = hasSubcategories ? '#C5D2F1' : color.sectionBorder;

    return (
        <div className="mb-2">
            {/* Header de la catégorie principale */}
            <div className="flex items-center gap-3 mb-4 px-4">
                <div className="flex-1 h-px" style={{ backgroundColor: headerLineColor }} />
                <span className="text-sm font-bold uppercase tracking-widest" style={{ color: headerTextColor }}>
                    {category.label}
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: headerLineColor }} />
            </div>

            {/* Items directs */}
            {(category.items ?? []).length > 0 && (
                <div className="flex flex-col gap-3 px-4 mb-4">
                    {(category.items ?? []).map((item, index) => (
                        <MobileItemCard
                            key={item.id ?? item.name}
                            item={item}
                            categoryColor={color}
                            isHighlighted
                            imagePosition={index % 2 === 0 ? 'right' : 'left'}
                            onTap={() => onItemTap(item)}
                        />
                    ))}
                </div>
            )}

            {/* Sous-catégories */}
            {hasSubcategories && category.subcategories!.map((sub, subIndex) => {
                const subColor = getCategoryColor(sub.color_key, subColorBaseIndex + subIndex);
                const items = sub.items ?? [];

                if (sub.is_highlighted) {
                    if (items.length === 0) return null;
                    return (
                        <div key={sub.id} className="mb-4">
                            {subIndex > 0 && (
                                <p className="text-xs font-semibold uppercase tracking-wider px-4 mb-3" style={{ color: subColor.sectionLabel + 'B3' }}>
                                    {sub.label}
                                </p>
                            )}
                            <div className="flex flex-col gap-3 px-4">
                                {items.map((item, index) => (
                                    <MobileItemCard
                                        key={item.id ?? item.name}
                                        item={item}
                                        categoryColor={subColor}
                                        isHighlighted
                                        imagePosition={index % 2 === 0 ? 'right' : 'left'}
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
                        />
                    </div>
                );
            })}
        </div>
    );
}
