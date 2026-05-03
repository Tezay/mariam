import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { galleryApi, menuItemImagesApi, menusApi } from '@/lib/api';
import type { GalleryImage, Menu, MenuItem, MenuItemImageLink } from '@/lib/api';

// ─── Pending image ops ────────────────────────────────────────────────────────

type PendingImageOp =
    | { kind: 'link-gallery'; itemId: number; galleryImageId: number }
    | { kind: 'upload-file'; itemId: number; file: File; dishName: string }
    | { kind: 'unlink'; itemId: number; linkId: number };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseMenuEditorOptions {
    date: string;
    menu: Menu | null;
    restaurantId: number | undefined;
}

export interface UseMenuEditorReturn {
    items: MenuItem[];
    chefNote: string;
    isDirty: boolean;
    isSaving: boolean;
    isPublishing: boolean;
    saveError: string | null;
    menuStatus: 'draft' | 'published' | null;
    menuId: number | undefined;
    restaurantId: number | undefined;
    updateItem(localId: number, patch: Partial<MenuItem>): void;
    addItem(categoryId: number, name?: string): void;
    removeItem(localId: number): void;
    reorderItems(categoryId: number, fromIdx: number, toIdx: number): void;
    setChefNote(note: string): void;
    queueSetGalleryImage(localItemId: number, galleryImage: GalleryImage): void;
    queueSetFileImage(localItemId: number, file: File): void;
    queueRemoveImage(localItemId: number): void;
    save(): Promise<void>;
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

function serializeItem(item: MenuItem): string {
    return JSON.stringify({
        id: item.id,
        name: item.name,
        category_id: item.category_id,
        is_out_of_stock: item.is_out_of_stock ?? false,
        replacement_label: item.replacement_label ?? null,
        tags: (item.tags ?? []).map(t => t.id).sort(),
        certifications: (item.certifications ?? []).map(c => c.id).sort(),
    });
}

function makeFakeImageLink(url: string): MenuItemImageLink {
    return { id: -1, menu_item_id: -1, gallery_image_id: -1, url, display_order: 0 };
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
    const [pendingImageOps, setPendingImageOps] = useState<PendingImageOp[]>([]);
    const objectUrlsRef = useRef<string[]>([]);

    const isDirty = useMemo(() => {
        if (pendingImageOps.length > 0) return true;
        if (chefNote !== originalChefNote) return true;
        if (items.length !== originalItems.length) return true;
        return items.some((item, i) => serializeItem(item) !== serializeItem(originalItems[i]));
    }, [items, originalItems, chefNote, originalChefNote, pendingImageOps]);

    // Reset when menu changes from outside (e.g. after reload)
    useEffect(() => {
        const loaded = itemsFromMenu(menu);
        setItems(loaded);
        setChefNoteState(menu?.chef_note ?? '');
        setOriginalItems(loaded);
        setOriginalChefNote(menu?.chef_note ?? '');
        setMenuStatus(menu?.status ?? null);
        setSaveError(null);
        objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        objectUrlsRef.current = [];
        setPendingImageOps([]);
    }, [menu]);

    const updateItem = useCallback((localId: number, patch: Partial<MenuItem>) => {
        setItems(prev => prev.map(it => it.id === localId ? { ...it, ...patch } : it));
    }, []);

    const addItem = useCallback((categoryId: number, name = 'Nouveau plat') => {
        const newItem: MenuItem = {
            id: nextTempId(),
            category_id: categoryId,
            name,
            order: 999,
            is_out_of_stock: false,
            tags: [],
            certifications: [],
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

    // ─── Image queue methods ──────────────────────────────────────────────────

    const queueSetGalleryImage = useCallback((localItemId: number, galleryImage: GalleryImage) => {
        setPendingImageOps(prev => [
            ...prev.filter(op => op.itemId !== localItemId),
            { kind: 'link-gallery', itemId: localItemId, galleryImageId: galleryImage.id },
        ]);
        setItems(prev => prev.map(it => it.id === localItemId
            ? { ...it, images: [{ id: -1, menu_item_id: localItemId, gallery_image_id: galleryImage.id, url: galleryImage.url, display_order: 0 }] }
            : it
        ));
    }, []);

    const queueSetFileImage = useCallback((localItemId: number, file: File) => {
        const objectUrl = URL.createObjectURL(file);
        objectUrlsRef.current.push(objectUrl);
        setPendingImageOps(prev => [
            ...prev.filter(op => op.itemId !== localItemId),
            { kind: 'upload-file', itemId: localItemId, file, dishName: '' },
        ]);
        setItems(prev => prev.map(it => it.id === localItemId
            ? { ...it, images: [makeFakeImageLink(objectUrl)] }
            : it
        ));
    }, []);

    const queueRemoveImage = useCallback((localItemId: number) => {
        setItems(prev => {
            const item = prev.find(it => it.id === localItemId);
            const linkId = item?.images?.[0]?.id ?? -1;
            setPendingImageOps(ops => [
                ...ops.filter(op => op.itemId !== localItemId),
                { kind: 'unlink', itemId: localItemId, linkId },
            ]);
            return prev.map(it => it.id === localItemId ? { ...it, images: [] } : it);
        });
    }, []);

    // ─── Save ─────────────────────────────────────────────────────────────────

    const buildSaveItems = (currentItems: MenuItem[]) =>
        currentItems.map(({ id, ...rest }) => {
            if (id !== undefined && id < 0) return rest;
            return { ...rest, id };
        }) as MenuItem[];

    const save = useCallback(async () => {
        setIsSaving(true);
        setSaveError(null);
        try {
            const savedMenu = await menusApi.save(date, buildSaveItems(items), restaurantIdProp ?? undefined, chefNote);
            const ops = pendingImageOps;
            for (const op of ops) {
                if (op.kind === 'link-gallery') {
                    await menuItemImagesApi.add(savedMenu.id, op.itemId, op.galleryImageId, 0);
                } else if (op.kind === 'upload-file') {
                    const item = items.find(it => it.id === op.itemId);
                    const g = await galleryApi.upload(op.file, { restaurant_id: restaurantIdProp, dish_name: item?.name ?? op.dishName });
                    await menuItemImagesApi.add(savedMenu.id, op.itemId, g.id, 0);
                } else if (op.kind === 'unlink') {
                    await menuItemImagesApi.remove(savedMenu.id, op.itemId, op.linkId);
                }
            }
            setPendingImageOps([]);
            objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
            objectUrlsRef.current = [];
            // Update items from saved menu (images will be refreshed by onReload caller)
            const savedItems = itemsFromMenu(savedMenu);
            setItems(savedItems);
            setOriginalItems(savedItems);
            setOriginalChefNote(savedMenu?.chef_note ?? chefNote);
            if (savedMenu?.status) setMenuStatus(savedMenu.status);
        } catch (err) {
            setSaveError('Erreur lors de la sauvegarde.');
            throw err;
        } finally {
            setIsSaving(false);
        }
    }, [date, items, restaurantIdProp, chefNote, pendingImageOps]);

    // publish/unpublish are independent from save — they only change the menu status
    const publishMenu = useCallback(async () => {
        if (!menu) return;
        setIsPublishing(true);
        setSaveError(null);
        try {
            await menusApi.publish(menu.id);
            setMenuStatus('published');
        } catch {
            setSaveError('Erreur lors de la publication.');
        } finally {
            setIsPublishing(false);
        }
    }, [menu]);

    const unpublishMenu = useCallback(async () => {
        if (!menu) return;
        setIsPublishing(true);
        setSaveError(null);
        try {
            await menusApi.unpublish(menu.id);
            setMenuStatus('draft');
        } catch {
            setSaveError('Erreur lors du retrait de publication.');
        } finally {
            setIsPublishing(false);
        }
    }, [menu]);

    const reset = useCallback(() => {
        const loaded = itemsFromMenu(menu);
        setItems(loaded);
        setChefNoteState(menu?.chef_note ?? '');
        setOriginalItems(loaded);
        setOriginalChefNote(menu?.chef_note ?? '');
        setSaveError(null);
        setPendingImageOps([]);
        objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
        objectUrlsRef.current = [];
    }, [menu]);

    return {
        items,
        chefNote,
        isDirty,
        isSaving,
        isPublishing,
        saveError,
        menuStatus,
        menuId: menu?.id,
        restaurantId: restaurantIdProp,
        updateItem,
        addItem,
        removeItem,
        reorderItems,
        setChefNote,
        queueSetGalleryImage,
        queueSetFileImage,
        queueRemoveImage,
        save,
        publishMenu,
        unpublishMenu,
        reset,
    };
}
