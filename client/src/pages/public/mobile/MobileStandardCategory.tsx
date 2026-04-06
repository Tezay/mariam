import type { DisplayCategory, MenuItemData } from '../menu-types';
import type { CategoryColor } from '@/lib/category-colors';
import { MobileItemCard } from './MobileItemCard';

interface MobileStandardCategoryProps {
    category: DisplayCategory;
    color: CategoryColor;
    onItemTap: (item: MenuItemData) => void;
    hideHeader?: boolean;
}

/** Déplace l'item au nom le plus long en dernière position quand le nombre est impair */
function reorderForGrid(items: MenuItemData[]): MenuItemData[] {
    if (items.length % 2 === 0) return items;
    let longestIdx = 0;
    for (let i = 1; i < items.length; i++) {
        if ((items[i].name?.length ?? 0) > (items[longestIdx].name?.length ?? 0)) {
            longestIdx = i;
        }
    }
    const reordered = [...items];
    const [longest] = reordered.splice(longestIdx, 1);
    reordered.push(longest);
    return reordered;
}

/** Affichage 2 items par rangée pour les catégories non-highlight */
export function MobileStandardCategory({ category, color, onItemTap, hideHeader = false }: MobileStandardCategoryProps) {
    const items = category.items ?? [];
    if (items.length === 0) return null;

    const orderedItems = reorderForGrid(items);
    const isOdd = orderedItems.length % 2 === 1;

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
                        key={item.id ?? item.name}
                        className={isOdd && index === orderedItems.length - 1 ? 'col-span-2' : ''}
                    >
                        <MobileItemCard
                            item={item}
                            categoryColor={color}
                            isHighlighted={false}
                            onTap={() => onItemTap(item)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
