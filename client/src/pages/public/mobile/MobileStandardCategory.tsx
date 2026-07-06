import type { DisplayCategory, MenuItemData, CategorySubstitutionData } from '../menu-types';
import type { CategoryColor } from '@/lib/category-colors';
import { MobileItemCard } from './MobileItemCard';

interface MobileStandardCategoryProps {
    category: DisplayCategory;
    color: CategoryColor;
    onItemTap: (item: MenuItemData) => void;
    hideHeader?: boolean;
    /** Substitutions par category_id ; affichées si la catégorie a un item en rupture. */
    substitutions?: Record<string, CategorySubstitutionData[]>;
}

/** Déplace l'item au nom le plus long en dernière position quand le nombre est impair */
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

/** Affichage 2 items par rangée pour les catégories non-highlight */
export function MobileStandardCategory({ category, color, onItemTap, hideHeader = false, substitutions }: MobileStandardCategoryProps) {
    const items = category.items ?? [];
    if (items.length === 0) return null;

    const orderedItems = reorderForGrid(items);

    // Plats de substitution : affichés uniquement si un item de la catégorie est en rupture
    const oosPresent = items.some(i => i.is_out_of_stock);
    const subCards: MenuItemData[] = oosPresent
        ? (substitutions?.[category.id] ?? []).map(s => ({
            dish: s.dish, category_id: category.id, is_out_of_stock: false,
        }))
        : [];

    const total = orderedItems.length + subCards.length;
    const isOdd = total % 2 === 1;

    return (
        <div className="mb-1">
            {!hideHeader && (
                <div className="flex items-center gap-3 mb-3 px-4">
                    <div className="flex-1 h-px" style={{ backgroundColor: color.sectionBorder }} />
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: color.sectionLabel }}>
                        {category.label}
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: color.sectionBorder }} />
                </div>
            )}

            {hideHeader && (
                <p className="text-xs font-semibold uppercase tracking-wider px-4 mb-2" style={{ color: color.sectionLabel }}>
                    {category.label}
                </p>
            )}

            <div className="grid grid-cols-2 gap-3 px-4">
                {orderedItems.map((item, index) => (
                    <div
                        key={item.id ?? item.dish?.name}
                        className={isOdd && index === total - 1 ? 'col-span-2' : ''}
                    >
                        <MobileItemCard
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
                            className={isOdd && index === total - 1 ? 'col-span-2' : ''}
                        >
                            <MobileItemCard
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
