/** Three at most, as the server allows. Shared by the day view and the menu onboarding. */
import { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import type { Dish } from '@/lib/api/dishes';
import { useSiteRef } from '@/contexts/SiteContext';
import { dishesApi } from '@/lib/api/dishes';
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

export function SubstituteCombobox({
  categoryId,
  existingIds,
  onAdd,
}: {
  categoryId: number;
  existingIds: number[];
  onAdd: (dish: Dish) => void;
}) {
  const site = useSiteRef();
  const [open, setOpen] = useState(false);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || dishes.length > 0) return;
    setLoading(true);
    dishesApi
      .listAll(site, { sort: 'name' })
      .then(setDishes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [site, open, dishes.length]);

  const available = dishes.filter(
    (d) => d.category_id === categoryId && !existingIds.includes(d.id)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-dashed border-orange-300 px-2 py-0.5 text-xs text-orange-500 transition-colors hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
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

  const handleAdd = (dish: Dish) => {
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
