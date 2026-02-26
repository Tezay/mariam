/**
 * MARIAM - Page Paramètres du Restaurant
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { adminApi, publicApi, MenuCategory, DietaryTag, CertificationItem, DietaryTagCategory, CertificationCategory } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { IconPicker, Icon } from '@/components/ui/icon-picker';
import { iconsData } from '@/components/ui/icons-data';
import { Save, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { IconName } from '@/components/ui/icon-picker';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Presets par défaut
const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

function serializeState(name: string, address: string, serviceDays: number[], categories: MenuCategory[], enabledTags: string[], enabledCerts: string[]): string {
    return JSON.stringify({ name, address, serviceDays, categories, enabledTags, enabledCerts });
}

export function SettingsPage() {
    const location = useLocation();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Taxonomy loaded from API (all available tags & certifications)
    const [tagCategories, setTagCategories] = useState<DietaryTagCategory[]>([]);
    const [certCategories, setCertCategories] = useState<CertificationCategory[]>([]);


    // Filtre des icônes (uniquement catégorie nourriture)
    const foodBeverageIcons = useMemo(() =>
        iconsData.filter(icon => icon.categories.includes('food-beverage')),
        []
    );

    // Configuration locale
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [serviceDays, setServiceDays] = useState<number[]>([0, 1, 2, 3, 4]);
    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);
    const [enabledTags, setEnabledTags] = useState<string[]>([]);
    const [enabledCerts, setEnabledCerts] = useState<string[]>([]);

    // Stockage de l'état original
    const originalStateRef = useRef<string>('');

    // Vérification des modifications
    const hasChanges = useMemo(() => {
        if (isLoading || originalStateRef.current === '') return false;
        const currentState = serializeState(name, address, serviceDays, categories, enabledTags, enabledCerts);
        return currentState !== originalStateRef.current;
    }, [name, address, serviceDays, categories, enabledTags, enabledCerts, isLoading]);

    // Charger les settings + taxonomy
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Load taxonomy first (all available tags/certs)
                try {
                    const taxonomy = await publicApi.getTaxonomy();
                    setTagCategories(taxonomy.dietary_tag_categories || []);
                    setCertCategories(taxonomy.certification_categories || []);
                } catch {
                    console.error('Erreur chargement taxonomie');
                }

                // Load restaurant settings
                const data = await adminApi.getSettings();
                const loadedName = data.name || '';
                const loadedAddress = data.address || '';
                const loadedServiceDays = data.config?.service_days || [0, 1, 2, 3, 4];
                const loadedCategories = data.config?.menu_categories || DEFAULT_CATEGORIES;
                const loadedTags = (data.config?.dietary_tags || []).map((t: DietaryTag) => t.id);
                const loadedCerts = (data.config?.certifications || []).map((c: CertificationItem) => c.id);

                setName(loadedName);
                setAddress(loadedAddress);
                setServiceDays(loadedServiceDays);
                setCategories(loadedCategories);
                setEnabledTags(loadedTags);
                setEnabledCerts(loadedCerts);

                // Stockage de l'état original
                originalStateRef.current = serializeState(loadedName, loadedAddress, loadedServiceDays, loadedCategories, loadedTags, loadedCerts);
            } catch (error) {
                console.error('Erreur chargement:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadSettings();
    }, []);

    // Avertissement avant de quitter si des modifications non sauvegardées
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    // Bloque les tentatives de navigation
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const anchor = target.closest('a');
            if (anchor && anchor.href && hasChanges) {
                const url = new URL(anchor.href);
                if (url.pathname !== location.pathname) {
                    const confirmLeave = window.confirm('Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter cette page ?');
                    if (!confirmLeave) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }
        };

        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [hasChanges, location.pathname]);

    // Sauvegarder
    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            // Assure que catégories ont des valeurs d'ordre correctes
            const orderedCategories = categories.map((cat, idx) => ({ ...cat, order: idx + 1 }));

            await adminApi.updateSettings({
                name,
                address,
                service_days: serviceDays,
                menu_categories: orderedCategories,
                dietary_tags: enabledTags,       // send IDs only
                certifications: enabledCerts,    // send IDs only
            });

            // Mise à jour de l'état original après sauvegarde
            originalStateRef.current = serializeState(name, address, serviceDays, orderedCategories, enabledTags, enabledCerts);
            setCategories(orderedCategories);

            setMessage({ type: 'success', text: 'Paramètres enregistrés avec succès !' });
        } catch (error) {
            setMessage({ type: 'error', text: 'Erreur lors de l\'enregistrement' });
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle jour de service
    const toggleDay = (day: number) => {
        if (serviceDays.includes(day)) {
            setServiceDays(serviceDays.filter(d => d !== day));
        } else {
            setServiceDays([...serviceDays, day].sort());
        }
    };


    const addCategory = () => {
        const newId = `cat_${Date.now()}`;
        setCategories([...categories, { id: newId, label: 'Nouvelle catégorie', icon: 'utensils', order: categories.length + 1 }]);
    };


    const removeCategory = (id: string) => {
        setCategories(categories.filter(c => c.id !== id));
    };

    // Update catégorie
    const updateCategory = (id: string, field: keyof MenuCategory, value: string | number) => {
        setCategories(categories.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    // Déplacer une catégorie vers le haut ou le bas
    const moveCategory = (index: number, direction: 'up' | 'down') => {
        const newCategories = [...categories];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= categories.length) return;

        // Swap positions
        [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];

        // Update valeurs d'ordre
        const reordered = newCategories.map((cat, idx) => ({ ...cat, order: idx + 1 }));
        setCategories(reordered);
    };

    // Toggle tag
    const toggleTag = (tagId: string) => {
        if (enabledTags.includes(tagId)) {
            setEnabledTags(enabledTags.filter(t => t !== tagId));
        } else {
            setEnabledTags([...enabledTags, tagId]);
        }
    };

    // Toggle certification
    const toggleCert = (certId: string) => {
        if (enabledCerts.includes(certId)) {
            setEnabledCerts(enabledCerts.filter(c => c !== certId));
        } else {
            setEnabledCerts([...enabledCerts, certId]);
        }
    };

    // Affiche l'icône pour les éléments prédéfinis
    const renderIcon = (iconName: string, className?: string) => {
        return <Icon name={iconName as IconName} className={className || 'w-4 h-4'} />;
    };

    if (isLoading) {
        return (
            <div className="container-mariam py-8 flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="container-mariam py-8 max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
                    <p className="text-muted-foreground">Configurez votre restaurant universitaire</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className={`gap-2 ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
            </div>

            {message && (
                <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                    {message.text}
                </div>
            )}

            {hasChanges && (
                <div className="mb-6 p-3 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm">
                    Vous avez des modifications non enregistrées.
                </div>
            )}

            <div className="space-y-6">
                {/* Informations générales */}
                <Card>
                    <CardHeader>
                        <CardTitle>Informations générales</CardTitle>
                        <CardDescription>Nom et adresse du restaurant</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="name">Nom du restaurant</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Restaurant Universitaire"
                            />
                        </div>
                        <div>
                            <Label htmlFor="address">Adresse</Label>
                            <Input
                                id="address"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Adresse du restaurant"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Jours de service */}
                <Card>
                    <CardHeader>
                        <CardTitle>Jours de service</CardTitle>
                        <CardDescription>Sélectionnez les jours où le restaurant est ouvert</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {DAY_NAMES.map((day, index) => (
                                <button
                                    key={index}
                                    onClick={() => toggleDay(index)}
                                    className={`px-4 py-2 rounded-lg border-2 transition-all ${serviceDays.includes(index)
                                        ? 'border-primary bg-primary/10 text-primary font-medium'
                                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                                        }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                            {serviceDays.length} jour{serviceDays.length > 1 ? 's' : ''} de service par semaine
                        </p>
                    </CardContent>
                </Card>

                {/* Catégories de menu */}
                <Card>
                    <CardHeader>
                        <CardTitle>Catégories de menu</CardTitle>
                        <CardDescription>Personnalisez les sections affichées dans les menus. Utilisez les flèches pour réordonner.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {categories.map((cat, index) => (
                                <div key={cat.id} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                                    {/* Boutons pour réordonner les catégories */}
                                    <div className="flex flex-col gap-0.5">
                                        <button
                                            onClick={() => moveCategory(index, 'up')}
                                            disabled={index === 0}
                                            className={`p-1 rounded hover:bg-muted ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            title="Monter"
                                        >
                                            <ArrowUp className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => moveCategory(index, 'down')}
                                            disabled={index === categories.length - 1}
                                            className={`p-1 rounded hover:bg-muted ${index === categories.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                            title="Descendre"
                                        >
                                            <ArrowDown className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <IconPicker
                                        value={cat.icon as IconName}
                                        onValueChange={(icon) => updateCategory(cat.id, 'icon', icon)}
                                        iconsList={foodBeverageIcons}
                                        categorized={false}
                                        searchPlaceholder="Rechercher..."
                                        triggerPlaceholder="Icône"
                                    >
                                        <Button variant="outline" size="icon" className="w-10 h-10">
                                            <Icon name={cat.icon as IconName} className="w-5 h-5" />
                                        </Button>
                                    </IconPicker>
                                    <Input
                                        value={cat.label}
                                        onChange={(e) => updateCategory(cat.id, 'label', e.target.value)}
                                        className="flex-1"
                                        placeholder="Nom de la catégorie"
                                    />
                                    <span className="text-xs text-muted-foreground w-6 text-center">#{index + 1}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeCategory(cat.id)}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" onClick={addCategory} className="mt-4 gap-2">
                            <Plus className="w-4 h-4" />
                            Ajouter une catégorie
                        </Button>
                    </CardContent>
                </Card>

                {/* Tags alimentaires */}
                <Card>
                    <CardHeader>
                        <CardTitle>Tags alimentaires</CardTitle>
                        <CardDescription>Activez les régimes alimentaires que vous souhaitez pouvoir indiquer</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {tagCategories.map(cat => (
                            <div key={cat.id}>
                                <p className="text-sm font-medium text-muted-foreground mb-2">{cat.name}</p>
                                <div className="flex flex-wrap gap-2">
                                    {cat.tags.map(tag => (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleTag(tag.id)}
                                            className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${enabledTags.includes(tag.id)
                                                ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
                                                : 'border-border text-muted-foreground hover:border-muted-foreground'
                                                }`}
                                        >
                                            {renderIcon(tag.icon, 'w-4 h-4')}
                                            <span>{tag.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {tagCategories.length === 0 && (
                            <p className="text-sm text-muted-foreground italic">Chargement des tags…</p>
                        )}
                    </CardContent>
                </Card>

                {/* Certifications */}
                <Card>
                    <CardHeader>
                        <CardTitle>Certifications et labels</CardTitle>
                        <CardDescription>Activez les certifications officielles que vous souhaitez pouvoir afficher</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {certCategories.map(cat => (
                            <div key={cat.id}>
                                <p className="text-sm font-medium text-muted-foreground mb-3">{cat.name}</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {cat.certifications.map(cert => {
                                        const isActive = enabledCerts.includes(cert.id);
                                        return (
                                            <button
                                                key={cert.id}
                                                onClick={() => toggleCert(cert.id)}
                                                className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all flex items-start gap-3 ${isActive
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : 'border-border hover:border-muted-foreground'
                                                    }`}
                                            >
                                                <img
                                                    src={`/certifications/${cert.logo_filename}`}
                                                    alt={cert.name}
                                                    className="w-8 h-8 object-contain shrink-0 mt-0.5"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-sm font-medium leading-tight ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
                                                        {cert.official_name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                                        {cert.guarantee}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 break-words">
                                                        {cert.issuer}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        {certCategories.length === 0 && (
                            <p className="text-sm text-muted-foreground italic">Chargement des certifications…</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Footer avec bouton save */}
            <div className="mt-8 flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    size="lg"
                    className={`gap-2 ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                </Button>
            </div>
        </div>
    );
}
