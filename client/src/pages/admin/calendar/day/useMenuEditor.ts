import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { menusApi } from '@/lib/api';
import type { Menu, MenuItem, DishCatalogItem } from '@/lib/api';
import { notify } from '@/lib/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseMenuEditorOptions {
    date: string;
    menu: Menu | null;
    restaurantId: number | undefined;
}

// substitutions: categoryId (number) -> ordered list of dishes
export type SubstitutionMap = Record<number, DishCatalogItem[]>;

export interface UseMenuEditorReturn {
    items: MenuItem[];
    chefNote: string;
    substitutions: SubstitutionMap;
    isDirty: boolean;
    isSaving: boolean;
    isPublishing: boolean;
    saveError: string | null;
    menuStatus: 'draft' | 'published' | null;
    menuId: number | undefined;
    restaurantId: number | undefined;
    updateItem(localId: number, patch: Partial<MenuItem>): void;
    addItem(categoryId: number, dishId: number, dish?: DishCatalogItem): void;
    removeItem(localId: number): void;
    reorderItems(categoryId: number, fromIdx: number, toIdx: number): void;
    setChefNote(note: string): void;
    updateSubstitutions(categoryId: number, dishes: DishCatalogItem[]): void;
    save(options?: { silent?: boolean }): Promise<void>;
    publishMenu(): Promise<void>;
    unpublishMenu(): Promise<void>;
    reset(): void;
}

let tempIdCounter = -1;
function nextTempId(): number { return tempIdCounter--; }

function itemsFromMenu(menu: Menu | null): MenuItem[] {
    return (menu?.items ?? []).map(item => ({
        ...item,
        id: item.id ?? nextTempId(),
    }));
}

function subsFromMenu(menu: Menu | null): SubstitutionMap {
    const raw = menu?.substitutions ?? {};
    const result: SubstitutionMap = {};
    for (const [catId, entries] of Object.entries(raw)) {
        result[Number(catId)] = entries.map(e => e.dish);
    }
    return result;
}

function serializeItem(item: MenuItem): string {
    return JSON.stringify({
        id: item.id,
        dish_id: item.dish_id,
        category_id: item.category_id,
        is_out_of_stock: item.is_out_of_stock ?? false,
    });
}

export function useMenuEditor({ date, menu, restaurantId: restaurantIdProp }: UseMenuEditorOptions): UseMenuEditorReturn {
    const [items, setItems] = useState<MenuItem[]>(() => itemsFromMenu(menu));
    const [chefNote, setChefNoteState] = useState<string>(menu?.chef_note ?? '');
    const [originalItems, setOriginalItems] = useState<MenuItem[]>(() => itemsFromMenu(menu));
    const [originalChefNote, setOriginalChefNote] = useState<string>(menu?.chef_note ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [menuStatus, setMenuStatus] = useState<'draft' | 'published' | null>(menu?.status ?? null);
    const [substitutions, setSubstitutions] = useState<SubstitutionMap>(() => subsFromMenu(menu));
    const [originalSubstitutions, setOriginalSubstitutions] = useState<SubstitutionMap>(() => subsFromMenu(menu));
    // ID créé par save() au démarrage sans menu ; la ref évite les closures périmées.
    const [savedMenuId, setSavedMenuId] = useState<number | undefined>(menu?.id);
    const savedMenuIdRef = useRef<number | undefined>(menu?.id);

    const menuId = menu?.id ?? savedMenuId;

    const isDirty = useMemo(() => {
        if (chefNote !== originalChefNote) return true;
        if (items.length !== originalItems.length) return true;
        if (items.some((item, i) => serializeItem(item) !== serializeItem(originalItems[i]))) return true;
        // Vérifier si les substitutions ont changé
        const allCatIds = new Set([
            ...Object.keys(substitutions).map(Number),
            ...Object.keys(originalSubstitutions).map(Number),
        ]);
        for (const catId of allCatIds) {
            const curr = (substitutions[catId] ?? []).map(d => d.id).sort().join(',');
            const orig = (originalSubstitutions[catId] ?? []).map(d => d.id).sort().join(',');
            if (curr !== orig) return true;
        }
        return false;
    }, [items, originalItems, chefNote, originalChefNote, substitutions, originalSubstitutions]);

    // Reset when menu changes from outside (e.g. after reload)
    useEffect(() => {
        const loaded = itemsFromMenu(menu);
        const subs = subsFromMenu(menu);
        setItems(loaded);
        setChefNoteState(menu?.chef_note ?? '');
        setOriginalItems(loaded);
        setOriginalChefNote(menu?.chef_note ?? '');
        setMenuStatus(menu?.status ?? null);
        setSubstitutions(subs);
        setOriginalSubstitutions(subs);
        setSavedMenuId(menu?.id);
        savedMenuIdRef.current = menu?.id;
        setSaveError(null);
    }, [menu]);

    const updateItem = useCallback((localId: number, patch: Partial<MenuItem>) => {
        setItems(prev => prev.map(it => it.id === localId ? { ...it, ...patch } : it));
    }, []);

    const addItem = useCallback((categoryId: number, dishId: number, dish?: DishCatalogItem) => {
        const newItem: MenuItem = {
            id: nextTempId(),
            category_id: categoryId,
            dish_id: dishId,
            order: 999,
            is_out_of_stock: false,
            dish: dish,
        };
        setItems(prev => [...prev, newItem]);
    }, []);

    const removeItem = useCallback((localId: number) => {
        setItems(prev => prev.filter(it => it.id !== localId));
    }, []);

    const reorderItems = useCallback((categoryId: number, fromIdx: number, toIdx: number) => {
        setItems(prev => {
            const catItems = prev.filter(it => it.category_id === categoryId);
            const others = prev.filter(it => it.category_id !== categoryId);
            const reordered = [...catItems];
            const [moved] = reordered.splice(fromIdx, 1);
            reordered.splice(toIdx, 0, moved);
            return [...others, ...reordered];
        });
    }, []);

    const setChefNote = useCallback((note: string) => {
        setChefNoteState(note);
    }, []);

    const updateSubstitutions = useCallback((categoryId: number, dishes: DishCatalogItem[]) => {
        setSubstitutions(prev => ({ ...prev, [categoryId]: dishes }));
    }, []);

    // ─── Save ─────────────────────────────────────────────────────────────────

    const buildSaveItems = (currentItems: MenuItem[]) =>
        currentItems.map(({ id, ...rest }) => {
            if (id !== undefined && id < 0) return rest;
            return { ...rest, id };
        }) as MenuItem[];

    const save = useCallback(async (options?: { silent?: boolean }) => {
        setIsSaving(true);
        setSaveError(null);
        try {
            const savedMenu = await menusApi.save(date, buildSaveItems(items), restaurantIdProp ?? undefined, chefNote);
            setSavedMenuId(savedMenu.id);
            savedMenuIdRef.current = savedMenu.id;
            // Sauvegarder les substitutions modifiées
            for (const [catId, dishes] of Object.entries(substitutions)) {
                const catIdNum = Number(catId);
                const origIds = (originalSubstitutions[catIdNum] ?? []).map(d => d.id).sort().join(',');
                const currIds = dishes.map(d => d.id).sort().join(',');
                if (origIds !== currIds) {
                    await menusApi.updateSubstitutions(savedMenu.id, catIdNum, dishes.map(d => d.id));
                }
            }
            const savedItems = itemsFromMenu(savedMenu);
            setItems(savedItems);
            setOriginalItems(savedItems);
            setOriginalChefNote(savedMenu?.chef_note ?? chefNote);
            setOriginalSubstitutions({ ...substitutions });
            if (savedMenu?.status) setMenuStatus(savedMenu.status);
            if (!options?.silent) notify.success('Menu sauvegardé');
        } catch (err) {
            setSaveError('Erreur lors de la sauvegarde.');
            notify.error('Erreur lors de la sauvegarde');
            throw err;
        } finally {
            setIsSaving(false);
        }
    }, [date, items, restaurantIdProp, chefNote, substitutions, originalSubstitutions]);

    const publishMenu = useCallback(async () => {
        const id = menu?.id ?? savedMenuIdRef.current;
        if (!id || items.length === 0) return;
        setIsPublishing(true);
        setSaveError(null);
        try {
            await menusApi.publish(id);
            setMenuStatus('published');
            notify.success('Menu publié');
        } catch {
            setSaveError('Erreur lors de la publication.');
            notify.error('Erreur lors de la publication');
        } finally {
            setIsPublishing(false);
        }
    }, [menu, items.length]);

    const unpublishMenu = useCallback(async () => {
        const id = menu?.id ?? savedMenuIdRef.current;
        if (!id) return;
        setIsPublishing(true);
        setSaveError(null);
        try {
            await menusApi.unpublish(id);
            setMenuStatus('draft');
            notify.success('Menu dépublié');
        } catch {
            setSaveError('Erreur lors du retrait de publication.');
            notify.error('Erreur lors du retrait de publication');
        } finally {
            setIsPublishing(false);
        }
    }, [menu]);

    const reset = useCallback(() => {
        setItems([...originalItems]);
        setChefNoteState(originalChefNote);
        setSubstitutions({ ...originalSubstitutions });
        setSaveError(null);
    }, [originalItems, originalChefNote, originalSubstitutions]);

    return {
        items,
        chefNote,
        substitutions,
        isDirty,
        isSaving,
        isPublishing,
        saveError,
        menuStatus,
        menuId,
        restaurantId: restaurantIdProp,
        updateItem,
        addItem,
        removeItem,
        reorderItems,
        setChefNote,
        updateSubstitutions,
        save,
        publishMenu,
        unpublishMenu,
        reset,
    };
}
