/**
 * MARIAM - Éditeur de menu (Drawer latéral)
 *
 * Fonctionnalités :
 * - Saisie d'items par catégorie dynamique (category_id: number)
 * - Sous-catégories imbriquées (ex: Plat principal → Protéines / Accompagnements)
 * - Champ replacement_label par item
 * - Tags alimentaires & certifications dans un dropdown Popover
 * - Upload / sélection d'images par item (galerie partagée, lié via menu_item_id)
 * - Max 10 items par catégorie/sous-catégorie
 * - Note du chef affichée en TV
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import {
    menusApi, adminApi, galleryApi, menuItemImagesApi, categoriesApi,
    Menu, MenuItem, MenuItemImageLink, MenuCategory, DietaryTag, CertificationItem,
    GalleryImage as GalleryImageType,
} from '@/lib/api';
import { GalleryPicker } from '@/components/GalleryPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
    Plus, X, Trash2, ChefHat, Tag, Upload, FolderOpen,
    RotateCcw, AlertTriangle,
} from 'lucide-react';
import type { IconName } from '@/components/ui/icon-picker';

interface MenuEditorProps {
    date: string;
    restaurantId: number;
    menu: Menu | null;
    onClose: () => void;
    onSave: () => void;
}

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_ITEM = 3;
const MAX_ITEMS_PER_CATEGORY = 10;

// Local editor representation of a menu item
interface EditorItem {
    id?: number;            // existing item ID (undefined for new items)
    category_id: number;
    name: string;
    order?: number;
    replacement_label?: string;
    tags: string[];
    certifications: string[];
}

// Image state for a single item slot (keyed by `${catId}_${localIndex}`)
interface ItemImageState {
    linked: MenuItemImageLink[];        // currently linked images (loaded from item.images)
    removedLinkIds: number[];           // IDs of links to delete on save
    pendingGallery: GalleryImageType[]; // gallery images to link (not yet saved)
    pendingFiles: File[];               // files to upload then link
}

type ItemsByCategory = Record<number, EditorItem[]>;
type ItemImagesMap = Record<string, ItemImageState>;

// Convert API MenuItem → local EditorItem
function toEditorItem(item: MenuItem): EditorItem {
    return {
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        order: item.order,
        replacement_label: item.replacement_label ?? undefined,
        tags: (item.tags || []).map(t => typeof t === 'string' ? t : t.id),
        certifications: (item.certifications || []).map(c => typeof c === 'string' ? c : c.id),
    };
}

// Flatten all leaf categories (no subcategories) from a tree
function flattenLeafCategories(cats: MenuCategory[]): MenuCategory[] {
    const result: MenuCategory[] = [];
    for (const cat of cats) {
        if (cat.subcategories && cat.subcategories.length > 0) {
            result.push(...flattenLeafCategories(cat.subcategories));
        } else {
            result.push(cat);
        }
    }
    return result;
}

// ========================================
// Composant principal
// ========================================

export function MenuEditor({ date, restaurantId, menu, onClose, onSave }: MenuEditorProps) {
    // Categories (top-level with nested subcategories)
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
    const [certifications, setCertifications] = useState<CertificationItem[]>([]);
    const [configLoaded, setConfigLoaded] = useState(false);

    // Items grouped by category_id (leaf categories only)
    const [itemsByCategory, setItemsByCategory] = useState<ItemsByCategory>({});

    // Note du chef
    const [chefNote, setChefNote] = useState(menu?.chef_note || '');

    // Image state per item slot
    const [itemImages, setItemImages] = useState<ItemImagesMap>({});

    // Gallery picker state
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ categoryId: number; itemIndex: number } | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isDraftingBack, setIsDraftingBack] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);

    // Leaf categories derived from the tree
    const leafCategories = useMemo(() => flattenLeafCategories(categories), [categories]);

    // Load restaurant config + taxonomy
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const [catData, settings] = await Promise.all([
                    categoriesApi.list(),
                    adminApi.getSettings(),
                ]);
                setCategories(catData.categories || []);
                if (settings?.config) {
                    setDietaryTags(settings.config.dietary_tags || []);
                    setCertifications(settings.config.certifications || []);
                }
            } catch (error) {
                console.error('Erreur chargement config:', error);
            } finally {
                setConfigLoaded(true);
            }
        };
        loadConfig();
    }, []);

    // Initialize items from existing menu once config is loaded
    useEffect(() => {
        if (!configLoaded || leafCategories.length === 0) return;

        const initialItems: ItemsByCategory = {};
        const imgMap: ItemImagesMap = {};

        for (const cat of leafCategories) {
            const existing = (menu?.items || [])
                .filter(i => i.category_id === cat.id)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map(toEditorItem);

            // Always start with at least one empty slot (except optional-style: handled by user adding)
            initialItems[cat.id] = existing.length > 0
                ? existing
                : [{ category_id: cat.id, name: '', tags: [], certifications: [] }];

            // Load image state for each existing item
            existing.forEach((item, idx) => {
                const key = `${cat.id}_${idx}`;
                imgMap[key] = {
                    linked: item.id
                        ? ((menu?.items || []).find(i => i.id === item.id)?.images || [])
                        : [],
                    removedLinkIds: [],
                    pendingGallery: [],
                    pendingFiles: [],
                };
            });
        }

        setItemsByCategory(initialItems);
        setItemImages(imgMap);
        setIsInitialized(true);
    }, [menu, leafCategories, configLoaded]);

    // ========================================
    // Dirty detection
    // ========================================

    const isDirty = useMemo(() => {
        if (!isInitialized) return false;
        if (chefNote !== (menu?.chef_note || '')) return true;

        // Pending / removed images
        for (const state of Object.values(itemImages)) {
            if (state.pendingFiles.length > 0) return true;
            if (state.pendingGallery.length > 0) return true;
            if (state.removedLinkIds.length > 0) return true;
        }

        // Item changes
        const currentItems = leafCategories.flatMap(cat =>
            (itemsByCategory[cat.id] || [])
                .filter(i => i.name.trim())
                .map(i => ({
                    category_id: i.category_id,
                    name: i.name,
                    replacement_label: i.replacement_label || '',
                    tags: [...(i.tags || [])].sort().join(','),
                    certs: [...(i.certifications || [])].sort().join(','),
                }))
        ).sort((a, b) => a.category_id - b.category_id || a.name.localeCompare(b.name));

        const originalItems = (menu?.items || [])
            .filter(i => i.name.trim())
            .map(i => ({
                category_id: i.category_id,
                name: i.name,
                replacement_label: i.replacement_label || '',
                tags: [...(i.tags || []).map(t => typeof t === 'string' ? t : t.id)].sort().join(','),
                certs: [...(i.certifications || []).map(c => typeof c === 'string' ? c : c.id)].sort().join(','),
            }))
            .sort((a, b) => a.category_id - b.category_id || a.name.localeCompare(b.name));

        if (currentItems.length !== originalItems.length) return true;
        for (let i = 0; i < currentItems.length; i++) {
            const cur = currentItems[i];
            const orig = originalItems[i];
            if (
                cur.name !== orig.name ||
                cur.category_id !== orig.category_id ||
                cur.replacement_label !== orig.replacement_label ||
                cur.tags !== orig.tags ||
                cur.certs !== orig.certs
            ) return true;
        }

        return false;
    }, [isInitialized, itemsByCategory, chefNote, itemImages, menu, leafCategories]);

    // ========================================
    // Helpers
    // ========================================

    const formatDate = () => {
        const d = new Date(date);
        return `${DAY_NAMES[d.getDay()]} ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    };

    const itemKey = (categoryId: number, index: number) => `${categoryId}_${index}`;

    const getItemImages = (categoryId: number, index: number): ItemImageState =>
        itemImages[itemKey(categoryId, index)] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] };

    const renderIcon = (iconName: string, className?: string) =>
        <Icon name={iconName as IconName} className={className || 'w-4 h-4'} />;

    // ========================================
    // Item CRUD
    // ========================================

    const updateItem = (
        categoryId: number,
        index: number,
        field: keyof EditorItem,
        value: string | string[] | number | undefined
    ) => {
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: (prev[categoryId] || []).map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            ),
        }));
    };

    const toggleTag = (categoryId: number, index: number, tagField: 'tags' | 'certifications', tagId: string) => {
        const item = itemsByCategory[categoryId]?.[index];
        if (!item) return;
        const current = item[tagField] || [];
        const updated = current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId];
        updateItem(categoryId, index, tagField, updated);
    };

    const addItem = (categoryId: number) => {
        const current = itemsByCategory[categoryId] || [];
        if (current.length >= MAX_ITEMS_PER_CATEGORY) return;
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: [...(prev[categoryId] || []), { category_id: categoryId, name: '', tags: [], certifications: [] }],
        }));
    };

    const removeItem = (categoryId: number, index: number) => {
        // Shift image state keys after removed index
        setItemImages(prev => {
            const next = { ...prev };
            delete next[itemKey(categoryId, index)];
            const items = itemsByCategory[categoryId] || [];
            for (let i = index + 1; i < items.length; i++) {
                const oldK = itemKey(categoryId, i);
                const newK = itemKey(categoryId, i - 1);
                if (next[oldK]) {
                    next[newK] = next[oldK];
                    delete next[oldK];
                }
            }
            return next;
        });
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: (prev[categoryId] || []).filter((_, i) => i !== index),
        }));
    };

    // ========================================
    // Image handlers
    // ========================================

    const handleItemFileUpload = (categoryId: number, index: number, files: FileList | File[]) => {
        const key = itemKey(categoryId, index);
        const current = getItemImages(categoryId, index);
        const used = current.linked.length - current.removedLinkIds.length + current.pendingGallery.length + current.pendingFiles.length;
        const remaining = MAX_IMAGES_PER_ITEM - used;
        if (remaining <= 0) return;

        const valid: File[] = [];
        for (const file of Array.from(files)) {
            if (valid.length >= remaining) break;
            if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
            if (file.size > MAX_FILE_SIZE) continue;
            valid.push(file);
        }
        if (valid.length === 0) return;

        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] }),
                pendingFiles: [...(prev[key]?.pendingFiles || []), ...valid],
            },
        }));
    };

    const handleRemovePendingFile = (categoryId: number, index: number, fileIdx: number) => {
        const key = itemKey(categoryId, index);
        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] }),
                pendingFiles: (prev[key]?.pendingFiles || []).filter((_, i) => i !== fileIdx),
            },
        }));
    };

    const handleRemovePendingGallery = (categoryId: number, index: number, galleryId: number) => {
        const key = itemKey(categoryId, index);
        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] }),
                pendingGallery: (prev[key]?.pendingGallery || []).filter(g => g.id !== galleryId),
            },
        }));
    };

    const handleRemoveLinkedImage = (categoryId: number, index: number, linkId: number) => {
        const key = itemKey(categoryId, index);
        setItemImages(prev => {
            const state = prev[key] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] };
            return {
                ...prev,
                [key]: {
                    ...state,
                    linked: state.linked.filter(l => l.id !== linkId),
                    removedLinkIds: [...state.removedLinkIds, linkId],
                },
            };
        });
    };

    const openGalleryPicker = (categoryId: number, index: number) => {
        setPickerTarget({ categoryId, itemIndex: index });
        setPickerOpen(true);
    };

    const handleGallerySelect = (image: GalleryImageType) => {
        if (!pickerTarget) return;
        const key = itemKey(pickerTarget.categoryId, pickerTarget.itemIndex);
        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] }),
                pendingGallery: [...(prev[key]?.pendingGallery || []), image],
            },
        }));
        setPickerOpen(false);
        setPickerTarget(null);
    };

    // ========================================
    // Save
    // ========================================

    const handleSave = async (publish = false, unpublishAfter = false) => {
        if (publish) setIsPublishing(true);
        else setIsSaving(true);

        try {
            // 1. Build items payload (non-empty items only), tracking submitted indices
            const allItems: MenuItem[] = [];
            // catId → list of local indices that were submitted (in order)
            const submittedIndices: Record<number, number[]> = {};

            for (const cat of leafCategories) {
                submittedIndices[cat.id] = [];
                const localItems = itemsByCategory[cat.id] || [];
                localItems.forEach((item, idx) => {
                    if (!item.name.trim()) return;
                    submittedIndices[cat.id].push(idx);
                    allItems.push({
                        ...(item.id ? { id: item.id } : {}),
                        category_id: cat.id,
                        name: item.name,
                        order: submittedIndices[cat.id].length - 1,
                        replacement_label: item.replacement_label?.trim() || null,
                        tags: item.tags as unknown as DietaryTag[],
                        certifications: item.certifications as unknown as CertificationItem[],
                    });
                });
            }

            // 2. Save menu (diff-based on backend)
            const savedMenu = await menusApi.save(date, allItems, restaurantId, chefNote.trim() || undefined);

            // 3. Reconcile images for each saved item
            if (savedMenu.id) {
                for (const cat of leafCategories) {
                    const savedItems = ((savedMenu.items || []) as MenuItem[])
                        .filter((i: MenuItem) => i.category_id === cat.id)
                        .sort((a: MenuItem, b: MenuItem) => (a.order ?? 0) - (b.order ?? 0));

                    const localIndices = submittedIndices[cat.id] || [];

                    for (let pos = 0; pos < savedItems.length && pos < localIndices.length; pos++) {
                        const savedItem = savedItems[pos];
                        const localIdx = localIndices[pos];
                        const key = itemKey(cat.id, localIdx);
                        const imgState = itemImages[key];
                        if (!imgState || !savedItem.id) continue;

                        // Remove deselected linked images
                        for (const linkId of imgState.removedLinkIds) {
                            try {
                                await menuItemImagesApi.remove(savedMenu.id, savedItem.id, linkId);
                            } catch { /* already removed */ }
                        }

                        // Calculate starting display_order
                        let displayOrder = imgState.linked.length - imgState.removedLinkIds.length;

                        // Add pending gallery selections
                        for (const gimg of imgState.pendingGallery) {
                            try {
                                await menuItemImagesApi.add(savedMenu.id, savedItem.id, gimg.id, displayOrder++);
                            } catch (err) {
                                console.error('Erreur liaison image galerie:', err);
                            }
                        }

                        // Upload pending files then link
                        for (const file of imgState.pendingFiles) {
                            try {
                                const uploaded = await galleryApi.upload(file, {
                                    dish_name: savedItem.name,
                                    category_id: cat.id,
                                    category_label: cat.label,
                                    restaurant_id: restaurantId,
                                });
                                await menuItemImagesApi.add(savedMenu.id, savedItem.id, uploaded.id, displayOrder++);
                            } catch (err) {
                                console.error('Erreur upload image:', err);
                            }
                        }
                    }
                }
            }

            // 4. Publish / unpublish
            if (publish && savedMenu.id) {
                await menusApi.publish(savedMenu.id);
            } else if (unpublishAfter && savedMenu.id) {
                await menusApi.unpublish(savedMenu.id);
            }

            onSave();
        } catch (error) {
            console.error('Erreur sauvegarde:', error);
        } finally {
            setIsSaving(false);
            setIsPublishing(false);
        }
    };

    const handleUnpublish = async () => {
        if (!menu?.id) return;
        setIsDraftingBack(true);
        try {
            await menusApi.unpublish(menu.id);
            onSave();
        } catch (error) {
            console.error('Erreur dépublication:', error);
        } finally {
            setIsDraftingBack(false);
        }
    };

    const handleCloseAttempt = () => {
        if (isDirty) setShowCloseConfirm(true);
        else onClose();
    };

    const handleDelete = async () => {
        if (!menu?.id) return;
        setIsDeleting(true);
        try {
            await menusApi.delete(menu.id);
            onSave();
        } catch (error) {
            console.error('Erreur suppression:', error);
        } finally {
            setIsDeleting(false);
            setShowResetConfirm(false);
        }
    };

    // ========================================
    // Render
    // ========================================

    if (!configLoaded) {
        return (
            <>
                <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
                <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border shadow-xl z-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                </div>
            </>
        );
    }

    const isAnyBusy = isSaving || isPublishing || isDraftingBack || isDeleting;
    const isPublished = menu?.status === 'published';

    const allExcludedGalleryIds = Object.values(itemImages).flatMap(s => [
        ...s.linked.map(l => l.gallery_image_id),
        ...s.pendingGallery.map(g => g.id),
    ]);

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={handleCloseAttempt} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border shadow-xl z-50 overflow-y-auto">

                {/* Header */}
                <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Menu du jour</h2>
                        <p className="text-sm text-muted-foreground">{formatDate()}</p>
                    </div>
                    <button onClick={handleCloseAttempt} className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenu */}
                <div className="p-6 space-y-6">
                    {categories.sort((a, b) => a.order - b.order).map(cat => (
                        <CategorySection
                            key={cat.id}
                            category={cat}
                            itemsByCategory={itemsByCategory}
                            dietaryTags={dietaryTags}
                            certifications={certifications}
                            itemImages={itemImages}
                            renderIcon={renderIcon}
                            disabled={isAnyBusy}
                            onUpdateItem={updateItem}
                            onToggleTag={toggleTag}
                            onAddItem={addItem}
                            onRemoveItem={removeItem}
                            onFileUpload={handleItemFileUpload}
                            onRemovePendingFile={handleRemovePendingFile}
                            onRemovePendingGallery={handleRemovePendingGallery}
                            onRemoveLinkedImage={handleRemoveLinkedImage}
                            onOpenGalleryPicker={openGalleryPicker}
                        />
                    ))}

                    <hr className="border-border" />

                    {/* Note du chef */}
                    <div>
                        <Label className="text-base flex items-center gap-2 mb-2">
                            <ChefHat className="w-5 h-5 text-muted-foreground" />
                            Note du chef
                        </Label>
                        <p className="text-xs text-muted-foreground mb-2">
                            Citation ou message affiché sur l'écran TV (max 300 caractères)
                        </p>
                        <Input
                            value={chefNote}
                            onChange={(e) => setChefNote(e.target.value)}
                            placeholder="Ex : Aujourd'hui, produits frais du marché !"
                            maxLength={300}
                        />
                        {chefNote.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1 text-right">{chefNote.length}/300</p>
                        )}
                    </div>

                    {/* Suppression du menu */}
                    {menu?.id && (
                        <div className="pt-2">
                            {!showResetConfirm ? (
                                <button
                                    onClick={() => setShowResetConfirm(true)}
                                    disabled={isAnyBusy}
                                    className="flex items-center gap-1.5 text-xs text-destructive/60 hover:text-destructive disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-destructive/5"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Supprimer ce menu
                                </button>
                            ) : (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex flex-col gap-3">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-destructive leading-snug">
                                                Supprimer définitivement ce menu ?
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Tous les éléments liés à ce menu seront perdus.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowResetConfirm(false)} disabled={isDeleting}>
                                            Annuler
                                        </Button>
                                        <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={handleDelete} disabled={isDeleting}>
                                            {isDeleting ? 'Suppression...' : 'Supprimer'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(() => {
                    let leftLabel: string;
                    let leftOnClick: () => void;
                    let leftDisabled: boolean;
                    if (isDirty) {
                        leftLabel = isSaving ? 'Enregistrement...' : (isPublished ? 'Enregistrer & brouillon' : 'Enregistrer brouillon');
                        leftOnClick = () => handleSave(false, isPublished);
                        leftDisabled = isAnyBusy;
                    } else if (isPublished) {
                        leftLabel = isDraftingBack ? 'En cours...' : 'Repasser en brouillon';
                        leftOnClick = handleUnpublish;
                        leftDisabled = isAnyBusy;
                    } else {
                        leftLabel = 'Enregistrer brouillon';
                        leftOnClick = () => {};
                        leftDisabled = true;
                    }
                    const rightLabel = isPublishing ? 'Publication...' : (isDirty ? 'Enregistrer & publier' : 'Publier');
                    const rightDisabled = isAnyBusy || (!isDirty && isPublished);

                    return (
                        <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3 flex gap-2 z-10">
                            <Button variant="outline" className="flex-1 min-w-0 text-sm" onClick={leftOnClick} disabled={leftDisabled}>
                                {!isDirty && isPublished && <RotateCcw className="w-3.5 h-3.5 mr-1.5 shrink-0" />}
                                <span className="truncate">{leftLabel}</span>
                            </Button>
                            <Button className="flex-1 min-w-0 text-sm" onClick={() => handleSave(true)} disabled={rightDisabled}>
                                <span className="truncate">{rightLabel}</span>
                            </Button>
                        </div>
                    );
                })()}
            </div>

            {/* Modale confirmation fermeture */}
            {showCloseConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCloseConfirm(false)} />
                    <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-amber-100 rounded-full shrink-0">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">Modifications non enregistrées</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Quitter maintenant supprimera définitivement vos modifications.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <Button variant="ghost" className="flex-1" onClick={() => setShowCloseConfirm(false)}>
                                Continuer l'édition
                            </Button>
                            <Button variant="destructive" className="flex-1" onClick={onClose}>
                                Quitter sans enregistrer
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Gallery Picker */}
            {pickerOpen && pickerTarget && (
                <GalleryPicker
                    onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
                    onSelect={handleGallerySelect}
                    excludeIds={allExcludedGalleryIds}
                    restaurantId={restaurantId}
                />
            )}
        </>
    );
}


// ========================================
// CategorySection — Render top-level or leaf category
// ========================================

interface CategorySectionProps {
    category: MenuCategory;
    itemsByCategory: ItemsByCategory;
    dietaryTags: DietaryTag[];
    certifications: CertificationItem[];
    itemImages: ItemImagesMap;
    renderIcon: (name: string, className?: string) => React.ReactNode;
    disabled: boolean;
    onUpdateItem: (catId: number, idx: number, field: keyof EditorItem, value: string | string[] | number | undefined) => void;
    onToggleTag: (catId: number, idx: number, field: 'tags' | 'certifications', tagId: string) => void;
    onAddItem: (catId: number) => void;
    onRemoveItem: (catId: number, idx: number) => void;
    onFileUpload: (catId: number, idx: number, files: FileList | File[]) => void;
    onRemovePendingFile: (catId: number, idx: number, fileIdx: number) => void;
    onRemovePendingGallery: (catId: number, idx: number, galleryId: number) => void;
    onRemoveLinkedImage: (catId: number, idx: number, linkId: number) => void;
    onOpenGalleryPicker: (catId: number, idx: number) => void;
}

function CategorySection({ category, ...props }: CategorySectionProps) {
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;

    if (hasSubcategories) {
        return (
            <div>
                <Label className="text-base flex items-center gap-2 mb-3">
                    {props.renderIcon(category.icon, 'w-5 h-5 text-muted-foreground')}
                    {category.label}
                </Label>
                <div className="space-y-4 pl-4 border-l-2 border-border">
                    {category.subcategories!.sort((a, b) => a.order - b.order).map(sub => (
                        <LeafCategorySection key={sub.id} category={sub} {...props} />
                    ))}
                </div>
            </div>
        );
    }

    return <LeafCategorySection category={category} {...props} />;
}


// ========================================
// LeafCategorySection — Items list for a leaf category
// ========================================

function LeafCategorySection({
    category, itemsByCategory, dietaryTags, certifications, itemImages,
    renderIcon, disabled, onUpdateItem, onToggleTag, onAddItem, onRemoveItem,
    onFileUpload, onRemovePendingFile, onRemovePendingGallery, onRemoveLinkedImage,
    onOpenGalleryPicker,
}: CategorySectionProps & { category: MenuCategory }) {
    const items = itemsByCategory[category.id] || [];
    const canAddMore = items.length < MAX_ITEMS_PER_CATEGORY;

    const getImgState = (idx: number): ItemImageState =>
        itemImages[`${category.id}_${idx}`] || { linked: [], removedLinkIds: [], pendingGallery: [], pendingFiles: [] };

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                    {renderIcon(category.icon, 'w-4 h-4 text-muted-foreground')}
                    {category.label}
                    {items.length >= MAX_ITEMS_PER_CATEGORY && (
                        <span className="text-[10px] text-muted-foreground/60 font-normal">(max {MAX_ITEMS_PER_CATEGORY})</span>
                    )}
                </Label>
                {canAddMore && (
                    <Button variant="ghost" size="sm" onClick={() => onAddItem(category.id)} className="gap-1 h-7 text-xs" disabled={disabled}>
                        <Plus className="w-3 h-3" />
                        Ajouter
                    </Button>
                )}
            </div>

            <div className="space-y-3">
                {items.map((item, index) => (
                    <CategoryItemEditor
                        key={index}
                        item={item}
                        index={index}
                        category={category}
                        itemsCount={items.length}
                        dietaryTags={dietaryTags}
                        certifications={certifications}
                        renderIcon={renderIcon}
                        imageState={getImgState(index)}
                        disabled={disabled}
                        onUpdateItem={onUpdateItem}
                        onToggleTag={onToggleTag}
                        onRemoveItem={() => onRemoveItem(category.id, index)}
                        onFileUpload={(files) => onFileUpload(category.id, index, files)}
                        onRemovePendingFile={(fi) => onRemovePendingFile(category.id, index, fi)}
                        onRemovePendingGallery={(gid) => onRemovePendingGallery(category.id, index, gid)}
                        onRemoveLinkedImage={(lid) => onRemoveLinkedImage(category.id, index, lid)}
                        onOpenGalleryPicker={() => onOpenGalleryPicker(category.id, index)}
                    />
                ))}

                {items.length === 0 && (
                    <p className="text-muted-foreground text-xs italic">Aucun élément</p>
                )}
            </div>
        </div>
    );
}


// ========================================
// CategoryItemEditor — Single item row
// ========================================

interface CategoryItemEditorProps {
    item: EditorItem;
    index: number;
    category: MenuCategory;
    itemsCount: number;
    dietaryTags: DietaryTag[];
    certifications: CertificationItem[];
    renderIcon: (name: string, className?: string) => React.ReactNode;
    imageState: ItemImageState;
    disabled: boolean;
    onUpdateItem: (catId: number, idx: number, field: keyof EditorItem, value: string | string[] | number | undefined) => void;
    onToggleTag: (catId: number, idx: number, field: 'tags' | 'certifications', tagId: string) => void;
    onRemoveItem: () => void;
    onFileUpload: (files: FileList | File[]) => void;
    onRemovePendingFile: (fileIdx: number) => void;
    onRemovePendingGallery: (galleryId: number) => void;
    onRemoveLinkedImage: (linkId: number) => void;
    onOpenGalleryPicker: () => void;
}

function CategoryItemEditor({
    item, index, category, itemsCount,
    dietaryTags, certifications, renderIcon, imageState, disabled,
    onUpdateItem, onToggleTag, onRemoveItem,
    onFileUpload, onRemovePendingFile, onRemovePendingGallery, onRemoveLinkedImage, onOpenGalleryPicker,
}: CategoryItemEditorProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dishNameFilled = item.name.trim().length > 0;

    const activeImages = imageState.linked.length - imageState.removedLinkIds.length;
    const totalImages = activeImages + imageState.pendingGallery.length + imageState.pendingFiles.length;
    const slotsLeft = MAX_IMAGES_PER_ITEM - totalImages;
    const activeTagCount = (item.tags?.length || 0) + (item.certifications?.length || 0);

    return (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            {/* Nom du plat */}
            <div className="flex gap-2">
                <Input
                    value={item.name}
                    onChange={(e) => onUpdateItem(category.id, index, 'name', e.target.value)}
                    placeholder={`${category.label}...`}
                    disabled={disabled}
                />
                {itemsCount > 1 && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onRemoveItem}
                        className="text-destructive hover:text-destructive shrink-0"
                        disabled={disabled}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Replacement label (shown when item has a name) */}
            {dishNameFilled && (
                <Input
                    value={item.replacement_label || ''}
                    onChange={(e) => onUpdateItem(category.id, index, 'replacement_label', e.target.value || undefined)}
                    placeholder="Remplacement en cas de rupture (facultatif)"
                    className="text-xs h-8 text-muted-foreground"
                    disabled={disabled}
                />
            )}

            {/* Tags / certifications */}
            <div className="flex items-center gap-2 flex-wrap">
                {(dietaryTags.length > 0 || certifications.length > 0) && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className={`
                                    text-xs px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5
                                    ${activeTagCount > 0
                                        ? 'bg-primary/10 border-primary/30 text-primary'
                                        : 'bg-muted border-border text-muted-foreground hover:text-foreground'
                                    }
                                `}
                            >
                                <Tag className="w-3 h-3" />
                                Tags{activeTagCount > 0 ? ` (${activeTagCount})` : ''}
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 p-3 space-y-3">
                            {dietaryTags.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Tags alimentaires</p>
                                    <div className="flex flex-wrap gap-1">
                                        {dietaryTags.map(tag => {
                                            const isActive = (item.tags || []).includes(tag.id);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => onToggleTag(category.id, index, 'tags', tag.id)}
                                                    className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                                                        isActive
                                                            ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                                                            : 'bg-muted border-border text-muted-foreground'
                                                    }`}
                                                >
                                                    {renderIcon(tag.icon, 'w-3 h-3')}
                                                    {tag.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {certifications.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Certifications</p>
                                    <div className="flex flex-wrap gap-1">
                                        {certifications.map(cert => {
                                            const isActive = (item.certifications || []).includes(cert.id);
                                            return (
                                                <button
                                                    key={cert.id}
                                                    type="button"
                                                    onClick={() => onToggleTag(category.id, index, 'certifications', cert.id)}
                                                    className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                                                        isActive
                                                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                                                            : 'bg-muted border-border text-muted-foreground'
                                                    }`}
                                                    title={cert.official_name}
                                                >
                                                    <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="w-4 h-4 object-contain" />
                                                    {cert.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                )}

                {(item.tags || []).map(tagId => {
                    const tag = dietaryTags.find(t => t.id === tagId);
                    return tag ? (
                        <span key={`tag-${tagId}`} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 flex items-center gap-1">
                            {renderIcon(tag.icon, 'w-3 h-3')}
                            {tag.label}
                        </span>
                    ) : null;
                })}
                {(item.certifications || []).map(certId => {
                    const cert = certifications.find(c => c.id === certId);
                    return cert ? (
                        <span key={`cert-${certId}`} className="inline-flex items-center" title={cert.official_name}>
                            <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="w-5 h-5 object-contain" />
                        </span>
                    ) : null;
                })}
            </div>

            {/* Images */}
            <div>
                {totalImages > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                        {imageState.linked.map(link => (
                            <div key={`l-${link.id}`} className="relative group w-14 h-14 rounded-md overflow-hidden border border-border">
                                <img src={link.url} alt="" className="w-full h-full object-cover" />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveLinkedImage(link.id)}
                                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3 text-white" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {imageState.pendingGallery.map(gimg => (
                            <div key={`g-${gimg.id}`} className="relative group w-14 h-14 rounded-md overflow-hidden border border-primary/30">
                                <img src={gimg.url} alt="" className="w-full h-full object-cover" />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => onRemovePendingGallery(gimg.id)}
                                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3 text-white" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {imageState.pendingFiles.map((file, fi) => (
                            <PendingThumb key={`p-${fi}`} file={file} onRemove={() => onRemovePendingFile(fi)} disabled={disabled} />
                        ))}
                    </div>
                )}

                {slotsLeft > 0 && !disabled && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!dishNameFilled}
                            onClick={() => fileInputRef.current?.click()}
                            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border transition-colors ${
                                dishNameFilled
                                    ? 'border-border hover:border-primary/40 text-muted-foreground hover:text-primary hover:bg-primary/5 cursor-pointer'
                                    : 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                            }`}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Ajouter une photo</span>
                        </button>
                        <button
                            type="button"
                            disabled={!dishNameFilled}
                            onClick={onOpenGalleryPicker}
                            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border transition-colors ${
                                dishNameFilled
                                    ? 'border-border hover:border-primary/40 text-muted-foreground hover:text-primary hover:bg-primary/5 cursor-pointer'
                                    : 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                            }`}
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Galerie</span>
                        </button>
                        {!dishNameFilled && (
                            <span className="text-[10px] text-muted-foreground/50 italic">Saisissez un nom pour ajouter des photos</span>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                if (e.target.files?.length) onFileUpload(e.target.files);
                                e.target.value = '';
                            }}
                        />
                    </div>
                )}

                {totalImages > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                        {totalImages}/{MAX_IMAGES_PER_ITEM} photo{totalImages > 1 ? 's' : ''}
                    </p>
                )}
            </div>
        </div>
    );
}


// ========================================
// PendingThumb — Preview for a file pending upload
// ========================================

function PendingThumb({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled: boolean }) {
    const [preview, setPreview] = useState<string | null>(null);

    useState(() => {
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    });

    return (
        <div className="relative group w-12 h-12 rounded-md overflow-hidden border-2 border-dashed border-primary/30 bg-primary/5">
            {preview && <img src={preview} alt="" className="w-full h-full object-cover opacity-70" />}
            <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-[8px] text-center py-px">
                En attente
            </div>
            {!disabled && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <X className="w-3 h-3 text-white" />
                </button>
            )}
        </div>
    );
}
