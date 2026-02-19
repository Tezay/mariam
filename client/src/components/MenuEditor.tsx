/**
 * MARIAM - Éditeur de menu (Drawer latéral)
 *
 * Fonctionnalités :
 * - Saisie d'items par catégorie dynamique
 * - Tags alimentaires & certifications dans un dropdown Popover
 * - Upload / sélection d'images par item (galerie partagée)
 * - Note du chef affichée en TV
 */
import { useState, useEffect, useRef } from 'react';
import {
    menusApi, adminApi, galleryApi, menuItemImagesApi,
    Menu, MenuItem, MenuCategory, DietaryTag, Certification,
    GalleryImage as GalleryImageType,
} from '@/lib/api';
import { GalleryPicker } from '@/components/GalleryPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon-picker';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
    Plus, X, Trash2, Leaf, BadgeCheck, Ban, WheatOff, MilkOff, Sprout, MapPin,
    Flag, Fish, ChefHat, Tag, Upload, FolderOpen,
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

// Configuration par défaut (fallback)
const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

const DEFAULT_DIETARY_TAGS: DietaryTag[] = [
    { id: 'vegetarian', label: 'Végétarien', icon: 'leaf', color: 'green' },
    { id: 'halal', label: 'Halal', icon: 'badge-check', color: 'teal' },
    { id: 'pork_free', label: 'Sans porc', icon: 'ban', color: 'orange' },
    { id: 'gluten_free', label: 'Sans gluten', icon: 'wheat-off', color: 'amber' },
];

const DEFAULT_CERTIFICATIONS: Certification[] = [
    { id: 'bio', label: 'Bio', icon: 'sprout', color: 'green' },
    { id: 'local', label: 'Local', icon: 'map-pin', color: 'blue' },
    { id: 'french_meat', label: 'Viande française', icon: 'flag', color: 'indigo' },
];

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
    'leaf': Leaf,
    'badge-check': BadgeCheck,
    'ban': Ban,
    'wheat-off': WheatOff,
    'milk-off': MilkOff,
    'sprout': Sprout,
    'map-pin': MapPin,
    'flag': Flag,
    'fish': Fish,
};

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES_PER_ITEM = 3;

interface ItemsByCategory {
    [categoryId: string]: MenuItem[];
}

/** Images liées à un item — clé : "categoryId_itemIndex" */
interface ItemImageState {
    gallery: GalleryImageType[];
    pending: File[];
}

type ItemImagesMap = Record<string, ItemImageState>;

// ========================================
// Composant principal
// ========================================

export function MenuEditor({ date, restaurantId, menu, onClose, onSave }: MenuEditorProps) {
    // Configuration du restaurant
    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);
    const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(DEFAULT_DIETARY_TAGS);
    const [certifications, setCertifications] = useState<Certification[]>(DEFAULT_CERTIFICATIONS);
    const [configLoaded, setConfigLoaded] = useState(false);

    // Items par catégorie
    const [itemsByCategory, setItemsByCategory] = useState<ItemsByCategory>({});

    // Note du chef
    const [chefNote, setChefNote] = useState(menu?.chef_note || '');

    // Images par item
    const [itemImages, setItemImages] = useState<ItemImagesMap>({});
    // Gallery picker
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ categoryId: string; itemIndex: number } | null>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    // Charger la configuration
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const data = await adminApi.getSettings();
                if (data?.config) {
                    setCategories(data.config.menu_categories || DEFAULT_CATEGORIES);
                    setDietaryTags(data.config.dietary_tags || DEFAULT_DIETARY_TAGS);
                    setCertifications(data.config.certifications || DEFAULT_CERTIFICATIONS);
                }
            } catch (error) {
                console.error('Erreur chargement config:', error);
            } finally {
                setConfigLoaded(true);
            }
        };
        loadConfig();
    }, []);

    // Charger les données existantes
    useEffect(() => {
        if (!configLoaded) return;

        const initialItems: ItemsByCategory = {};

        categories.forEach(cat => {
            const existing = menu?.items?.filter(i => i.category === cat.id) || [];
            if (existing.length > 0) {
                initialItems[cat.id] = existing;
            } else if (cat.id === 'vg') {
                initialItems[cat.id] = [];
            } else {
                initialItems[cat.id] = [{ category: cat.id, name: '' }];
            }
        });

        setItemsByCategory(initialItems);

        // Charger les images par item depuis les item_images du menu
        const imgMap: ItemImagesMap = {};
        if (menu?.item_images) {
            for (const link of menu.item_images) {
                const key = `${link.category}_${link.item_index}`;
                if (!imgMap[key]) {
                    imgMap[key] = { gallery: [], pending: [] };
                }
                imgMap[key].gallery.push({
                    id: link.gallery_image_id,
                    restaurant_id: menu.restaurant_id,
                    url: link.url,
                    filename: link.filename || undefined,
                    tags: [],
                });
            }
        }
        setItemImages(imgMap);
    }, [menu, categories, configLoaded]);

    // ========================================
    // Helpers
    // ========================================

    const formatDate = () => {
        const d = new Date(date);
        const dayName = DAY_NAMES[d.getDay()];
        return `${dayName} ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    };

    const itemKey = (categoryId: string, index: number) => `${categoryId}_${index}`;

    const getItemImages = (categoryId: string, index: number): ItemImageState =>
        itemImages[itemKey(categoryId, index)] || { gallery: [], pending: [] };

    const renderIcon = (iconName: string, className?: string) => {
        const IconComponent = ICON_COMPONENTS[iconName];
        if (IconComponent) {
            return <IconComponent className={className || 'w-4 h-4'} />;
        }
        return <Icon name={iconName as IconName} className={className || 'w-4 h-4'} />;
    };

    // ========================================
    // Item CRUD
    // ========================================

    const updateItem = (categoryId: string, index: number, field: keyof MenuItem, value: string | boolean | string[]) => {
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: prev[categoryId].map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            ),
        }));
    };

    const toggleTag = (categoryId: string, index: number, tagField: 'tags' | 'certifications', tagId: string) => {
        const item = itemsByCategory[categoryId]?.[index];
        if (!item) return;
        const current = item[tagField] || [];
        const updated = current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId];
        updateItem(categoryId, index, tagField, updated);
    };

    const addItem = (categoryId: string) => {
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: [...(prev[categoryId] || []), { category: categoryId, name: '' }],
        }));
    };

    const removeItem = (categoryId: string, index: number) => {
        const key = itemKey(categoryId, index);
        setItemImages(prev => {
            const next = { ...prev };
            delete next[key];
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
            [categoryId]: prev[categoryId].filter((_, i) => i !== index),
        }));
    };

    // ========================================
    // Image handlers per item
    // ========================================

    const handleItemFileUpload = (categoryId: string, index: number, files: FileList | File[]) => {
        const key = itemKey(categoryId, index);
        const current = getItemImages(categoryId, index);
        const remaining = MAX_IMAGES_PER_ITEM - current.gallery.length - current.pending.length;
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
                ...(prev[key] || { gallery: [], pending: [] }),
                pending: [...(prev[key]?.pending || []), ...valid],
            },
        }));
    };

    const handleRemovePendingImage = (categoryId: string, index: number, fileIdx: number) => {
        const key = itemKey(categoryId, index);
        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { gallery: [], pending: [] }),
                pending: (prev[key]?.pending || []).filter((_, i) => i !== fileIdx),
            },
        }));
    };

    const handleRemoveGalleryImage = (categoryId: string, index: number, galleryId: number) => {
        const key = itemKey(categoryId, index);
        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { gallery: [], pending: [] }),
                gallery: (prev[key]?.gallery || []).filter(g => g.id !== galleryId),
            },
        }));
    };

    const openGalleryPicker = (categoryId: string, index: number) => {
        setPickerTarget({ categoryId, itemIndex: index });
        setPickerOpen(true);
    };

    const handleGallerySelect = (image: GalleryImageType) => {
        if (!pickerTarget) return;
        const key = itemKey(pickerTarget.categoryId, pickerTarget.itemIndex);
        setItemImages(prev => ({
            ...prev,
            [key]: {
                ...(prev[key] || { gallery: [], pending: [] }),
                gallery: [...(prev[key]?.gallery || []), image],
            },
        }));
        setPickerOpen(false);
        setPickerTarget(null);
    };

    // ========================================
    // Save
    // ========================================

    const handleSave = async (publish = false) => {
        if (publish) setIsPublishing(true);
        else setIsSaving(true);

        try {
            // 1. Combine valid items
            const allItems: MenuItem[] = [];
            categories.forEach(cat => {
                const catItems = itemsByCategory[cat.id] || [];
                catItems
                    .filter(item => item.name.trim())
                    .forEach((item, idx) => {
                        allItems.push({
                            ...item,
                            category: cat.id,
                            order: idx,
                            is_vegetarian: cat.id === 'vg' ? true : item.is_vegetarian,
                        });
                    });
            });

            // 2. Save menu
            const savedMenu = await menusApi.save(date, allItems, restaurantId, chefNote.trim() || undefined);

            // 3. Upload pending images to gallery & collect links
            const allLinks: Array<{
                gallery_image_id: number;
                category: string;
                item_index: number;
                display_order: number;
            }> = [];

            for (const cat of categories) {
                const catItems = itemsByCategory[cat.id] || [];
                for (let idx = 0; idx < catItems.length; idx++) {
                    const item = catItems[idx];
                    if (!item.name.trim()) continue;

                    const key = itemKey(cat.id, idx);
                    const state = itemImages[key];
                    if (!state) continue;

                    let order = 0;

                    for (const gimg of state.gallery) {
                        allLinks.push({
                            gallery_image_id: gimg.id,
                            category: cat.id,
                            item_index: idx,
                            display_order: order++,
                        });
                    }

                    for (const file of state.pending) {
                        try {
                            const uploaded = await galleryApi.upload(file, {
                                dish_name: item.name.trim(),
                                category_id: cat.id,
                                category_label: cat.label,
                                restaurant_id: restaurantId,
                            });
                            allLinks.push({
                                gallery_image_id: uploaded.id,
                                category: cat.id,
                                item_index: idx,
                                display_order: order++,
                            });
                        } catch (err) {
                            console.error('Erreur upload image galerie:', err);
                        }
                    }
                }
            }

            // 4. Sync item images
            if (savedMenu.id) {
                await menuItemImagesApi.sync(savedMenu.id, allLinks);
            }

            // 5. Publish if requested
            if (publish && savedMenu.id) {
                await menusApi.publish(savedMenu.id);
            }

            onSave();
        } catch (error) {
            console.error('Erreur sauvegarde:', error);
        } finally {
            setIsSaving(false);
            setIsPublishing(false);
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
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            </>
        );
    }

    const allUsedGalleryIds = Object.values(itemImages).flatMap(s => s.gallery.map(g => g.id));

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border shadow-xl z-50 overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Menu du jour</h2>
                        <p className="text-sm text-muted-foreground">{formatDate()}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenu — Catégories dynamiques */}
                <div className="p-6 space-y-6">
                    {categories.sort((a, b) => a.order - b.order).map(category => {
                        const items = itemsByCategory[category.id] || [];
                        const isOptional = category.id === 'vg';
                        const showAddButton = isOptional ? items.length === 0 : true;

                        return (
                            <div key={category.id}>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-base flex items-center gap-2">
                                        {renderIcon(category.icon, 'w-5 h-5 text-muted-foreground')}
                                        {category.label}
                                    </Label>
                                    {showAddButton && (
                                        <Button variant="ghost" size="sm" onClick={() => addItem(category.id)} className="gap-1">
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
                                            categoryId={category.id}
                                            categoryLabel={category.label}
                                            isOptional={isOptional}
                                            itemsCount={items.length}
                                            dietaryTags={dietaryTags}
                                            certifications={certifications}
                                            renderIcon={renderIcon}
                                            imageState={getItemImages(category.id, index)}
                                            maxImages={MAX_IMAGES_PER_ITEM}
                                            onUpdateItem={updateItem}
                                            onToggleTag={toggleTag}
                                            onRemoveItem={() => removeItem(category.id, index)}
                                            onFileUpload={(files) => handleItemFileUpload(category.id, index, files)}
                                            onRemovePendingImage={(fi) => handleRemovePendingImage(category.id, index, fi)}
                                            onRemoveGalleryImage={(gid) => handleRemoveGalleryImage(category.id, index, gid)}
                                            onOpenGalleryPicker={() => openGalleryPicker(category.id, index)}
                                            disabled={isSaving || isPublishing}
                                        />
                                    ))}

                                    {items.length === 0 && !isOptional && (
                                        <p className="text-muted-foreground text-sm italic">Aucun élément</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Séparateur */}
                    <hr className="border-border" />

                    {/* Note du chef */}
                    <div>
                        <Label className="text-base flex items-center gap-2 mb-2">
                            <ChefHat className="w-5 h-5 text-muted-foreground" />
                            Note du chef
                        </Label>
                        <p className="text-xs text-muted-foreground mb-2">
                            Citation ou message du chef affiché sur l'écran TV (max 300 caractères)
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
                </div>

                {/* Footer avec boutons */}
                <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex gap-3">
                    <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleSave(false)}
                        disabled={isSaving || isPublishing}
                    >
                        {isSaving ? 'Enregistrement...' : 'Enregistrer brouillon'}
                    </Button>
                    <Button
                        className="flex-1"
                        onClick={() => handleSave(true)}
                        disabled={isSaving || isPublishing}
                    >
                        {isPublishing ? 'Publication...' : 'Publier'}
                    </Button>
                </div>
            </div>

            {/* Gallery Picker modal */}
            {pickerOpen && pickerTarget && (
                <GalleryPicker
                    onClose={() => { setPickerOpen(false); setPickerTarget(null); }}
                    onSelect={handleGallerySelect}
                    excludeIds={allUsedGalleryIds}
                    defaultCategory={pickerTarget.categoryId}
                    categories={categories}
                    restaurantId={restaurantId}
                />
            )}
        </>
    );
}


// ========================================
// Sous-composant : éditeur d'item de catégorie
// ========================================

interface CategoryItemEditorProps {
    item: MenuItem;
    index: number;
    categoryId: string;
    categoryLabel: string;
    isOptional: boolean;
    itemsCount: number;
    dietaryTags: DietaryTag[];
    certifications: Certification[];
    renderIcon: (name: string, className?: string) => React.ReactNode;
    imageState: ItemImageState;
    maxImages: number;
    onUpdateItem: (catId: string, idx: number, field: keyof MenuItem, value: string | boolean | string[]) => void;
    onToggleTag: (catId: string, idx: number, field: 'tags' | 'certifications', tagId: string) => void;
    onRemoveItem: () => void;
    onFileUpload: (files: FileList | File[]) => void;
    onRemovePendingImage: (fileIdx: number) => void;
    onRemoveGalleryImage: (galleryId: number) => void;
    onOpenGalleryPicker: () => void;
    disabled: boolean;
}

function CategoryItemEditor({
    item, index, categoryId, categoryLabel, isOptional, itemsCount,
    dietaryTags, certifications, renderIcon, imageState, maxImages,
    onUpdateItem, onToggleTag, onRemoveItem,
    onFileUpload, onRemovePendingImage, onRemoveGalleryImage, onOpenGalleryPicker,
    disabled,
}: CategoryItemEditorProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dishNameFilled = item.name.trim().length > 0;
    const totalImages = imageState.gallery.length + imageState.pending.length;
    const slotsLeft = maxImages - totalImages;

    const activeTagCount = (item.tags?.length || 0) + (item.certifications?.length || 0);

    return (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            {/* Nom du plat + actions */}
            <div className="flex gap-2">
                <Input
                    value={item.name}
                    onChange={(e) => onUpdateItem(categoryId, index, 'name', e.target.value)}
                    placeholder={`${categoryLabel}...`}
                    className={categoryId === 'vg' ? 'border-green-500/50 focus:ring-green-500' : ''}
                />
                {(itemsCount > 1 || isOptional) && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onRemoveItem}
                        className="text-destructive hover:text-destructive shrink-0"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Tags dropdown + active tags badges */}
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
                                                    onClick={() => onToggleTag(categoryId, index, 'tags', tag.id)}
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
                                                    onClick={() => onToggleTag(categoryId, index, 'certifications', cert.id)}
                                                    className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                                                        isActive
                                                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                                                            : 'bg-muted border-border text-muted-foreground'
                                                    }`}
                                                >
                                                    {renderIcon(cert.icon, 'w-3 h-3')}
                                                    {cert.label}
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
                        <span key={`tag-${tagId}`} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                            {tag.label}
                        </span>
                    ) : null;
                })}
                {(item.certifications || []).map(certId => {
                    const cert = certifications.find(c => c.id === certId);
                    return cert ? (
                        <span key={`cert-${certId}`} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            {cert.label}
                        </span>
                    ) : null;
                })}
            </div>

            {/* Images section — per item */}
            <div>
                {/* Existing image thumbnails */}
                {totalImages > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                        {imageState.gallery.map((gimg) => (
                            <div key={`g-${gimg.id}`} className="relative group w-14 h-14 rounded-md overflow-hidden border border-border">
                                <img src={gimg.url} alt="" className="w-full h-full object-cover" />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveGalleryImage(gimg.id)}
                                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Retirer"
                                    >
                                        <X className="w-3 h-3 text-white" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {imageState.pending.map((file, fi) => (
                            <PendingThumb key={`p-${fi}`} file={file} onRemove={() => onRemovePendingImage(fi)} disabled={disabled} />
                        ))}
                    </div>
                )}

                {/* Add image actions */}
                {slotsLeft > 0 && !disabled && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={!dishNameFilled}
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                                flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border transition-colors
                                ${dishNameFilled
                                    ? 'border-border hover:border-primary/40 text-muted-foreground hover:text-primary hover:bg-primary/5 cursor-pointer'
                                    : 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                                }
                            `}
                            title={dishNameFilled ? 'Uploader une photo' : 'Renseignez le nom du plat d\'abord'}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Ajouter une photo</span>
                        </button>
                        <button
                            type="button"
                            disabled={!dishNameFilled}
                            onClick={onOpenGalleryPicker}
                            className={`
                                flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border transition-colors
                                ${dishNameFilled
                                    ? 'border-border hover:border-primary/40 text-muted-foreground hover:text-primary hover:bg-primary/5 cursor-pointer'
                                    : 'border-border/40 text-muted-foreground/30 cursor-not-allowed'
                                }
                            `}
                            title={dishNameFilled ? 'Choisir depuis la galerie' : 'Renseignez le nom du plat d\'abord'}
                        >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>Galerie</span>
                        </button>
                        {!dishNameFilled && (
                            <span className="text-[10px] text-muted-foreground/50 italic">Saisissez un nom de plat pour ajouter des photos</span>
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

                {/* Counter info */}
                {totalImages > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                        {totalImages}/{maxImages} photo{totalImages > 1 ? 's' : ''}
                    </p>
                )}
            </div>
        </div>
    );
}


// ========================================
// Thumbnail d'un fichier en attente
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
                    title="Retirer"
                >
                    <X className="w-3 h-3 text-white" />
                </button>
            )}
        </div>
    );
}
