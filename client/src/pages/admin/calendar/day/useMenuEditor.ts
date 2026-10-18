import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSiteRef } from '@/contexts/SiteContext';
import { menusApi } from '@/lib/api/menus';
import type { Menu, MenuDish } from '@/lib/api/menus';
import { menuItems } from '@/lib/menu-tree';
import { notify } from '@/lib/toast';

export interface UseMenuEditorOptions {
  date: string;
  menu: Menu | null;
}

/** An item as the editor holds it; its id is negative until the menu is saved. */
export interface EditorItem {
  id: number;
  category_id: number;
  dish_id: number;
  dish?: MenuDish;
  order: number;
  is_out_of_stock: boolean;
}

// substitutions: categoryId (number) -> ordered list of dishes
export type SubstitutionMap = Record<number, MenuDish[]>;

export interface UseMenuEditorReturn {
  items: EditorItem[];
  chefNote: string;
  substitutions: SubstitutionMap;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  saveError: string | null;
  menuStatus: 'draft' | 'published' | null;
  updateItem(localId: number, patch: Partial<EditorItem>): void;
  addItem(categoryId: number, dishId: number, dish?: MenuDish): void;
  removeItem(localId: number): void;
  reorderItems(categoryId: number, fromIdx: number, toIdx: number): void;
  setChefNote(note: string): void;
  updateSubstitutions(categoryId: number, dishes: MenuDish[]): void;
  save(options?: { silent?: boolean }): Promise<void>;
  publishMenu(): Promise<void>;
  unpublishMenu(): Promise<void>;
  reset(): void;
}

let tempIdCounter = -1;
function nextTempId(): number {
  return tempIdCounter--;
}

export function editorItems(menu: Menu | null): EditorItem[] {
  return (menu ? menuItems(menu) : []).map((item) => ({ ...item, dish_id: item.dish.id }));
}

function subsFromMenu(menu: Menu | null): SubstitutionMap {
  const raw = menu?.substitutions ?? {};
  const result: SubstitutionMap = {};
  for (const [catId, entries] of Object.entries(raw)) {
    result[Number(catId)] = entries.map((e) => e.dish);
  }
  return result;
}

function serializeItem(item: EditorItem): string {
  return JSON.stringify({
    id: item.id,
    dish_id: item.dish_id,
    category_id: item.category_id,
    is_out_of_stock: item.is_out_of_stock ?? false,
  });
}

export function useMenuEditor({ date, menu }: UseMenuEditorOptions): UseMenuEditorReturn {
  const site = useSiteRef();
  const [items, setItems] = useState<EditorItem[]>(() => editorItems(menu));
  const [chefNote, setChefNoteState] = useState<string>(menu?.chef_note ?? '');
  const [originalItems, setOriginalItems] = useState<EditorItem[]>(() => editorItems(menu));
  const [originalChefNote, setOriginalChefNote] = useState<string>(menu?.chef_note ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [menuStatus, setMenuStatus] = useState<'draft' | 'published' | null>(menu?.status ?? null);
  const [substitutions, setSubstitutions] = useState<SubstitutionMap>(() => subsFromMenu(menu));
  const [originalSubstitutions, setOriginalSubstitutions] = useState<SubstitutionMap>(() =>
    subsFromMenu(menu)
  );
  // Set by the first save() of a day without a menu; the ref keeps closures current.
  const savedRef = useRef(menu !== null);
  const isDirty = useMemo(() => {
    if (chefNote !== originalChefNote) return true;
    if (items.length !== originalItems.length) return true;
    if (items.some((item, i) => serializeItem(item) !== serializeItem(originalItems[i])))
      return true;
    const allCatIds = new Set([
      ...Object.keys(substitutions).map(Number),
      ...Object.keys(originalSubstitutions).map(Number),
    ]);
    for (const catId of allCatIds) {
      const curr = (substitutions[catId] ?? [])
        .map((d) => d.id)
        .sort()
        .join(',');
      const orig = (originalSubstitutions[catId] ?? [])
        .map((d) => d.id)
        .sort()
        .join(',');
      if (curr !== orig) return true;
    }
    return false;
  }, [items, originalItems, chefNote, originalChefNote, substitutions, originalSubstitutions]);

  // Reset when menu changes from outside (e.g. after reload)
  useEffect(() => {
    const loaded = editorItems(menu);
    const subs = subsFromMenu(menu);
    setItems(loaded);
    setChefNoteState(menu?.chef_note ?? '');
    setOriginalItems(loaded);
    setOriginalChefNote(menu?.chef_note ?? '');
    setMenuStatus(menu?.status ?? null);
    setSubstitutions(subs);
    setOriginalSubstitutions(subs);
    savedRef.current = menu !== null;
    setSaveError(null);
  }, [menu]);

  const updateItem = useCallback((localId: number, patch: Partial<EditorItem>) => {
    setItems((prev) => prev.map((it) => (it.id === localId ? { ...it, ...patch } : it)));
  }, []);

  const addItem = useCallback((categoryId: number, dishId: number, dish?: MenuDish) => {
    const newItem: EditorItem = {
      id: nextTempId(),
      category_id: categoryId,
      dish_id: dishId,
      order: 999,
      is_out_of_stock: false,
      dish: dish,
    };
    setItems((prev) => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((localId: number) => {
    setItems((prev) => prev.filter((it) => it.id !== localId));
  }, []);

  const reorderItems = useCallback((categoryId: number, fromIdx: number, toIdx: number) => {
    setItems((prev) => {
      const catItems = prev.filter((it) => it.category_id === categoryId);
      const others = prev.filter((it) => it.category_id !== categoryId);
      const reordered = [...catItems];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return [...others, ...reordered];
    });
  }, []);

  const setChefNote = useCallback((note: string) => {
    setChefNoteState(note);
  }, []);

  const updateSubstitutions = useCallback((categoryId: number, dishes: MenuDish[]) => {
    setSubstitutions((prev) => ({ ...prev, [categoryId]: dishes }));
  }, []);

  const buildSaveItems = (currentItems: EditorItem[]) =>
    currentItems.map(({ id, category_id, dish_id, order, is_out_of_stock }) => ({
      ...(id > 0 ? { id } : {}),
      category_id,
      dish_id,
      order,
      is_out_of_stock,
    }));

  const save = useCallback(
    async (options?: { silent?: boolean }) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const savedMenu = await menusApi.put(site, date, buildSaveItems(items), chefNote || null);
        savedRef.current = true;
        for (const [catId, dishes] of Object.entries(substitutions)) {
          const catIdNum = Number(catId);
          const origIds = (originalSubstitutions[catIdNum] ?? [])
            .map((d) => d.id)
            .sort()
            .join(',');
          const currIds = dishes
            .map((d) => d.id)
            .sort()
            .join(',');
          if (origIds !== currIds) {
            await menusApi.setSubstitutes(
              site,
              date,
              catIdNum,
              dishes.map((d) => d.id)
            );
          }
        }
        const savedItems = editorItems(savedMenu);
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
    },
    [site, date, items, chefNote, substitutions, originalSubstitutions]
  );

  const publishMenu = useCallback(async () => {
    if (!savedRef.current || items.length === 0) return;
    setIsPublishing(true);
    setSaveError(null);
    try {
      await menusApi.publish(site, date);
      setMenuStatus('published');
      notify.success('Menu publié');
    } catch {
      setSaveError('Erreur lors de la publication.');
      notify.error('Erreur lors de la publication');
    } finally {
      setIsPublishing(false);
    }
  }, [site, date, items.length]);

  const unpublishMenu = useCallback(async () => {
    if (!savedRef.current) return;
    setIsPublishing(true);
    setSaveError(null);
    try {
      await menusApi.unpublish(site, date);
      setMenuStatus('draft');
      notify.success('Menu dépublié');
    } catch {
      setSaveError('Erreur lors du retrait de publication.');
      notify.error('Erreur lors du retrait de publication');
    } finally {
      setIsPublishing(false);
    }
  }, [site, date]);

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
