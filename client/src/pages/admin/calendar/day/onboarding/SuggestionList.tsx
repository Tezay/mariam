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
    <div className="flex flex-wrap content-start gap-2">
      {dishes.map((dish) => (
        <button
          key={dish.id}
          type="button"
          onClick={(e) => onSelect(dish, e.currentTarget)}
          className="flex max-w-full items-center gap-1.5 rounded-xl border border-border bg-card py-1.5 pl-1.5 pr-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 active:scale-[0.97]"
        >
          {dish.image_url ? (
            <img src={dish.image_url} alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" />
          ) : (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
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
