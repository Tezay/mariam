import type { DisplayCategory, MenuItemData } from '../menu-types';
import { getCategoryColor } from '@/lib/category-colors';
import { HIGHLIGHTED_COLOR } from '@/lib/category-colors';
import { MobileItemCard } from './MobileItemCard';
import { MobileStandardCategory } from './MobileStandardCategory';

interface MobileHighlightedCategoryProps {
    category: DisplayCategory;
    onItemTap: (item: MenuItemData) => void;
    subColorBaseIndex?: number;
}

export function MobileHighlightedCategory({ category, onItemTap, subColorBaseIndex = 0 }: MobileHighlightedCategoryProps) {
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;

    return (
        <div className="mb-2">
            {/* Header de la catégorie principale */}
            <div className="flex items-center gap-3 mb-4 px-4">
                <div className="flex-1 h-px bg-mariam-blue/30" />
                <span className="text-sm font-bold uppercase tracking-widest text-mariam-blue">
                    {category.label}
                </span>
                <div className="flex-1 h-px bg-mariam-blue/30" />
            </div>

            {/* Items directs */}
            {(category.items ?? []).length > 0 && (
                <div className="flex flex-col gap-3 px-4 mb-4">
                    {(category.items ?? []).map((item, index) => (
                        <MobileItemCard
                            key={item.id ?? item.name}
                            item={item}
                            categoryColor={HIGHLIGHTED_COLOR}
                            isHighlighted
                            imagePosition={index % 2 === 0 ? 'right' : 'left'}
                            onTap={() => onItemTap(item)}
                        />
                    ))}
                </div>
            )}

            {/* Sous-catégories */}
            {hasSubcategories && category.subcategories!.map((sub, subIndex) => {
                if (sub.is_highlighted) {
                    const items = sub.items ?? [];
                    if (items.length === 0) return null;
                    return (
                        <div key={sub.id} className="mb-4">
                            {/* Nom masqué pour la première sous-catégorie */}
                            {subIndex > 0 && (
                                <p className="text-xs font-semibold uppercase tracking-wider px-4 mb-3 text-mariam-blue/70">
                                    {sub.label}
                                </p>
                            )}
                            <div className="flex flex-col gap-3 px-4">
                                {items.map((item, index) => (
                                    <MobileItemCard
                                        key={item.id ?? item.name}
                                        item={item}
                                        categoryColor={HIGHLIGHTED_COLOR}
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
                const subColor = getCategoryColor(sub.color_key, subColorBaseIndex + subIndex);
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
