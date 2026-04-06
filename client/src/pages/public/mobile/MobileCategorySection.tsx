import type { DisplayCategory, MenuItemData } from '../menu-types';
import { getCategoryColor } from '@/lib/category-colors';
import { MobileStandardCategory } from './MobileStandardCategory';
import { MobileHighlightedCategory } from './MobileHighlightedCategory';

interface MobileCategorySectionProps {
    categories: DisplayCategory[];
    onItemTap: (item: MenuItemData) => void;
}

/** Orchestre l'affichage de toutes les catégories top-level.
 *  - highlight : MobileHighlightedCategory (pleine largeur, image alternée)
 *  - standard  : MobileStandardCategory (grille 2 colonnes, couleur palette)
 */
export function MobileCategorySection({ categories, onItemTap }: MobileCategorySectionProps) {
    let standardColorIndex = 0;

    return (
        <div className="flex flex-col gap-6 py-4">
            {categories.map(category => {
                // Ignorer les catégories vides (ni items directs, ni sous-catégories avec items)
                const hasItems = (category.items ?? []).length > 0;
                const hasSubs = (category.subcategories ?? []).some(s => (s.items ?? []).length > 0);
                if (!hasItems && !hasSubs) return null;

                if (category.is_highlighted) {
                    const result = (
                        <MobileHighlightedCategory
                            key={category.id}
                            category={category}
                            onItemTap={onItemTap}
                            subColorBaseIndex={standardColorIndex}
                        />
                    );
                    // Incrémente l'index couleur selon le nombre de sous-catégories non-highlight
                    const nonHighlightSubs = (category.subcategories ?? []).filter(s => !s.is_highlighted);
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
                    />
                );
            })}
        </div>
    );
}
