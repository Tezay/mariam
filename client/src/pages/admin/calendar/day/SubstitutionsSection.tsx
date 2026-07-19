/**
 * Édition des plats de substitution d'une catégorie (max 3).
 * Utilisé par le popover « En cas de rupture ? » du jour (AdminCategorySection)
 * et par l'étape substitutions de l'onboarding de création de menu.
 */
import { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import type { DishCatalogItem } from '@/lib/api';
import { catalogApi } from '@/lib/api';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { UseMenuEditorReturn } from './useMenuEditor';

// ─── SubstituteCombobox ───────────────────────────────────────────────────────

export function SubstituteCombobox({
  categoryId,
  existingIds,
  onAdd,
}: {
  categoryId: number;
  existingIds: number[];
  onAdd: (dish: DishCatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dishes, setDishes] = useState<DishCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || dishes.length > 0) return;
    setLoading(true);
    catalogApi
      .list({ sort: 'name' })
      .then(setDishes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, dishes.length]);

  // Filtrer par catégorie + exclure les substituts déjà définis
  const available = dishes.filter(
    (d) => d.category_id === categoryId && !existingIds.includes(d.id)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-dashed border-orange-300 px-2 py-0.5 text-xs text-orange-500 transition-colors hover:border-orange-400 hover:bg-orange-50"
        >
          <Plus className="h-2.5 w-2.5" />
          Ajouter
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher…" />
          <CommandList>
            {loading && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                <Search className="mx-auto mb-1 h-3.5 w-3.5 animate-pulse" />
                Chargement…
              </div>
            )}
            {!loading && <CommandEmpty>Aucun plat.</CommandEmpty>}
            {!loading && (
              <CommandGroup>
                {available.map((dish) => (
                  <CommandItem
                    key={dish.id}
                    value={dish.name}
                    onSelect={() => {
                      onAdd(dish);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <span className="truncate text-sm">{dish.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── SubstitutionsSection ─────────────────────────────────────────────────────

export function SubstitutionsSection({
  categoryId,
  editor,
}: {
  categoryId: number;
  editor: UseMenuEditorReturn;
}) {
  const dishes = editor.substitutions[categoryId] ?? [];

  const handleRemove = (dishId: number) => {
    editor.updateSubstitutions(
      categoryId,
      dishes.filter((d) => d.id !== dishId)
    );
  };

  const handleAdd = (dish: DishCatalogItem) => {
    if (dishes.some((d) => d.id === dish.id)) return;
    editor.updateSubstitutions(categoryId, [...dishes, dish]);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {dishes.map((dish) => (
          <span
            key={dish.id}
            className="flex items-center gap-1 rounded-full border border-orange-200 bg-white px-2 py-0.5 text-xs dark:border-orange-700 dark:bg-card"
          >
            {dish.name}
            <button
              type="button"
              onClick={() => handleRemove(dish.id)}
              className="ml-0.5 text-muted-foreground/40 transition-colors hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {dishes.length < 3 && (
          <SubstituteCombobox
            categoryId={categoryId}
            existingIds={dishes.map((d) => d.id)}
            onAdd={handleAdd}
          />
        )}
        {dishes.length === 0 && (
          <p className="text-xs italic text-muted-foreground/60">Aucun substitut configuré</p>
        )}
      </div>
    </div>
  );
}
