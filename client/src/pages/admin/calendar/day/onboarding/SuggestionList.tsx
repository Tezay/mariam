/**
 * Chips de suggestions de plats (catégorie courante uniquement, dédupliqués,
 * hors plats déjà au menu). Purement présentational — le filtrage est fait
 * par l'appelant (ItemPickStep).
 */
import type { DishCatalogItem } from '@/lib/api';
import type { CategoryColor } from '@/lib/category-colors';

interface SuggestionListProps {
    dishes: DishCatalogItem[];
    color: CategoryColor;
    onSelect: (dish: DishCatalogItem, sourceEl: HTMLElement) => void;
}

export function SuggestionList({ dishes, color, onSelect }: SuggestionListProps) {
    return (
        <div className="flex flex-wrap gap-2 content-start">
            {dishes.map(dish => (
                <button
                    key={dish.id}
                    type="button"
                    onClick={e => onSelect(dish, e.currentTarget)}
                    className="flex items-center gap-1.5 max-w-full rounded-xl border border-border bg-card pl-1.5 pr-2.5 py-1.5 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors active:scale-[0.97]"
                >
                    {dish.image_url ? (
                        <img src={dish.image_url} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0" />
                    ) : (
                        <span
                            className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold"
                            style={{ backgroundColor: `${color.bg}22`, color: color.sectionLabel }}
                        >
                            {dish.name.charAt(0).toUpperCase()}
                        </span>
                    )}
                    <span className="truncate">{dish.name}</span>
                </button>
            ))}
        </div>
    );
}
