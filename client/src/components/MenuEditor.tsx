/**
 * MARIAM - Éditeur de menu (Drawer latéral)
 */
import { useState, useEffect } from 'react';
import { menusApi, adminApi, Menu, MenuItem, MenuCategory, DietaryTag, Certification } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon-picker';
import { Plus, X, Trash2, Leaf, BadgeCheck, Ban, WheatOff, MilkOff, Sprout, MapPin, Flag, Fish } from 'lucide-react';
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

interface ItemsByCategory {
    [categoryId: string]: MenuItem[];
}

export function MenuEditor({ date, restaurantId, menu, onClose, onSave }: MenuEditorProps) {
    // Configuration du restaurant
    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);
    const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(DEFAULT_DIETARY_TAGS);
    const [certifications, setCertifications] = useState<Certification[]>(DEFAULT_CERTIFICATIONS);
    const [configLoaded, setConfigLoaded] = useState(false);

    // Items par catégorie
    const [itemsByCategory, setItemsByCategory] = useState<ItemsByCategory>({});

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

        // Initialiser chaque catégorie
        categories.forEach(cat => {
            const existing = menu?.items?.filter(i => i.category === cat.id) || [];
            if (existing.length > 0) {
                initialItems[cat.id] = existing;
            } else if (cat.id === 'vg') {
                // VG optionnel : pas d'item par défaut
                initialItems[cat.id] = [];
            } else {
                // Une entrée vide par défaut pour les autres
                initialItems[cat.id] = [{ category: cat.id, name: '' }];
            }
        });

        setItemsByCategory(initialItems);
    }, [menu, categories, configLoaded]);

    // Formater la date
    const formatDate = () => {
        const d = new Date(date);
        const dayName = DAY_NAMES[d.getDay()];
        return `${dayName} ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    };

    // Mettre à jour un item
    const updateItem = (categoryId: string, index: number, field: keyof MenuItem, value: string | boolean | string[]) => {
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: prev[categoryId].map((item, i) =>
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    // Toggle un tag ou certification
    const toggleTag = (categoryId: string, index: number, tagField: 'tags' | 'certifications', tagId: string) => {
        const item = itemsByCategory[categoryId]?.[index];
        if (!item) return;

        const currentTags = item[tagField] || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter(t => t !== tagId)
            : [...currentTags, tagId];

        updateItem(categoryId, index, tagField, newTags);
    };

    // Ajouter un item
    const addItem = (categoryId: string) => {
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: [...(prev[categoryId] || []), { category: categoryId, name: '' }]
        }));
    };

    // Supprimer un item
    const removeItem = (categoryId: string, index: number) => {
        setItemsByCategory(prev => ({
            ...prev,
            [categoryId]: prev[categoryId].filter((_, i) => i !== index)
        }));
    };

    // Rendu des icons
    const renderIcon = (iconName: string, className?: string) => {
        const IconComponent = ICON_COMPONENTS[iconName];
        if (IconComponent) {
            return <IconComponent className={className || 'w-4 h-4'} />;
        }
        return <Icon name={iconName as IconName} className={className || 'w-4 h-4'} />;
    };

    // Sauvegarder
    const handleSave = async (publish = false) => {
        if (publish) {
            setIsPublishing(true);
        } else {
            setIsSaving(true);
        }

        try {
            // Combiner tous les items valides
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
                            // Marquer automatiquement comme végétarien si c'est la catégorie VG
                            is_vegetarian: cat.id === 'vg' ? true : item.is_vegetarian
                        });
                    });
            });

            // Sauvegarder
            const savedMenu = await menusApi.save(date, allItems, restaurantId);

            // Publier si demandé
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

    if (!configLoaded) {
        return (
            <>
                <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
                <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-mariam-blue"></div>
                </div>
            </>
        );
    }

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl z-50 overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                    <div>
                        <h2 className="text-lg font-semibold">Menu du jour</h2>
                        <p className="text-sm text-gray-500">{formatDate()}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenu - Catégories dynamiques */}
                <div className="p-6 space-y-6">
                    {categories.sort((a, b) => a.order - b.order).map(category => {
                        const items = itemsByCategory[category.id] || [];
                        const isOptional = category.id === 'vg'; // VG est optionnel
                        const showAddButton = isOptional ? items.length === 0 : true;

                        return (
                            <div key={category.id}>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-base flex items-center gap-2">
                                        {renderIcon(category.icon, 'w-5 h-5 text-gray-600')}
                                        {category.label}
                                    </Label>
                                    {showAddButton && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => addItem(category.id)}
                                            className="gap-1"
                                        >
                                            <Plus className="w-3 h-3" />
                                            Ajouter
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {items.map((item, index) => (
                                        <div key={index} className="space-y-2 p-3 bg-gray-50 rounded-lg">
                                            <div className="flex gap-2">
                                                <Input
                                                    value={item.name}
                                                    onChange={(e) => updateItem(category.id, index, 'name', e.target.value)}
                                                    placeholder={`${category.label}...`}
                                                    className={category.id === 'vg' ? 'border-green-300 focus:ring-green-500' : ''}
                                                />
                                                {(items.length > 1 || isOptional) && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => removeItem(category.id, index)}
                                                        className="text-red-500 hover:text-red-700"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            {/* Tags alimentaires */}
                                            {dietaryTags.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {dietaryTags.map(tag => {
                                                        const itemTags = item.tags || [];
                                                        const isActive = itemTags.includes(tag.id);
                                                        return (
                                                            <button
                                                                key={tag.id}
                                                                type="button"
                                                                onClick={() => toggleTag(category.id, index, 'tags', tag.id)}
                                                                className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${isActive
                                                                    ? 'bg-green-100 border-green-300 text-green-700'
                                                                    : 'bg-gray-100 border-gray-200 text-gray-500'
                                                                    }`}
                                                            >
                                                                {renderIcon(tag.icon, 'w-3 h-3')}
                                                                {tag.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Certifications */}
                                            {certifications.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {certifications.map(cert => {
                                                        const itemCerts = item.certifications || [];
                                                        const isActive = itemCerts.includes(cert.id);
                                                        return (
                                                            <button
                                                                key={cert.id}
                                                                type="button"
                                                                onClick={() => toggleTag(category.id, index, 'certifications', cert.id)}
                                                                className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${isActive
                                                                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                                    : 'bg-gray-100 border-gray-200 text-gray-500'
                                                                    }`}
                                                            >
                                                                {renderIcon(cert.icon, 'w-3 h-3')}
                                                                {cert.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {items.length === 0 && !isOptional && (
                                        <p className="text-gray-400 text-sm italic">Aucun élément</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer avec boutons */}
                <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
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
        </>
    );
}
