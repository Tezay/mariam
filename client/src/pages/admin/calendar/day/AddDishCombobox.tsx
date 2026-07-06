import { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { catalogApi } from '@/lib/api';
import type { DishCatalogItem } from '@/lib/api';
import type { UseMenuEditorReturn } from './useMenuEditor';

interface AddDishComboboxProps {
    categoryId: number;
    editor: UseMenuEditorReturn;
    compact?: boolean;
}

export function AddDishCombobox({ categoryId, editor, compact }: AddDishComboboxProps) {
    const [open, setOpen] = useState(false);
    const [dishes, setDishes] = useState<DishCatalogItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || dishes.length > 0) return;
        setLoading(true);
        catalogApi.list({ sort: 'name' })
            .then(setDishes)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [open, dishes.length]);

    // IDs déjà présents dans cette catégorie — on ne les propose pas à nouveau
    const existingDishIds = new Set(
        editor.items.filter(i => i.category_id === categoryId).map(i => i.dish_id)
    );
    // Plats filtrés : même catégorie + non déjà ajoutés
    const available = dishes.filter(d => d.category_id === categoryId && !existingDishIds.has(d.id));

    const handleSelect = (dish: DishCatalogItem) => {
        editor.addItem(categoryId, dish.id, dish);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={compact
                        ? "flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors px-1 py-0.5 w-full justify-center"
                        : "flex items-center gap-1.5 mt-2 text-xs text-muted-foreground hover:text-primary transition-colors px-1 py-0.5"
                    }
                >
                    <Plus className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
                    {compact ? 'Ajouter' : 'Ajouter un plat'}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
                <Command>
                    <CommandInput placeholder="Rechercher un plat…" />
                    <CommandList>
                        {loading && (
                            <div className="py-4 text-center text-xs text-muted-foreground">
                                <Search className="w-4 h-4 mx-auto mb-1 animate-pulse" />
                                Chargement…
                            </div>
                        )}
                        {!loading && (
                            <CommandEmpty>Aucun plat disponible.</CommandEmpty>
                        )}
                        {!loading && available.length > 0 && (
                            <CommandGroup>
                                {available.map(dish => (
                                    <CommandItem
                                        key={dish.id}
                                        value={dish.name}
                                        onSelect={() => handleSelect(dish)}
                                        className="flex items-center justify-between gap-2 cursor-pointer"
                                    >
                                        <span className="truncate text-sm">{dish.name}</span>
                                        {dish.usage_count > 0 && (
                                            <span className="text-[10px] text-muted-foreground shrink-0">
                                                ×{dish.usage_count}
                                            </span>
                                        )}
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
