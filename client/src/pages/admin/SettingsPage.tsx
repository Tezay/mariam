/**
 * MARIAM - Page Paramètres du Restaurant
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
    adminApi, categoriesApi, publicApi, banApi,
    MenuCategory, DietaryTag, CertificationItem, DietaryTagCategory, CertificationCategory,
    ServiceHours, BanSuggestion, RestaurantWithConfig,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconPicker, Icon } from '@/components/ui/icon-picker';
import { iconsData } from '@/components/ui/icons-data';
import { Save, Plus, Trash2, ArrowUp, ArrowDown, Star, StarOff, Lock, ChevronRight, MapPin, Accessibility, CreditCard, Check, Palette } from 'lucide-react';
import type { IconName } from '@/components/ui/icon-picker';
import { COLOR_KEY_MAP } from '@/lib/category-colors';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const PAYMENT_OPTIONS: { id: string; label: string }[] = [
    { id: 'izly', label: 'Izly' },
    { id: 'cb', label: 'Carte bancaire' },
    { id: 'cash', label: 'Espèces' },
    { id: 'ticket_restaurant', label: 'Ticket restaurant' },
];

function validateEmail(val: string): string | null {
    if (!val) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Adresse email invalide';
}

function validatePhone(val: string): string | null {
    if (!val) return null;
    const digits = val.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return 'Numéro invalide (7 à 15 chiffres)';
    if (!/^\+?[\d\s\-().]+$/.test(val)) return 'Format invalide';
    return null;
}

function serializeState(
    name: string,
    serviceDays: number[],
    serviceHours: ServiceHours,
    enabledTags: string[],
    enabledCerts: string[],
    addressLabel: string,
    addressLat: number | null,
    addressLon: number | null,
    email: string,
    phone: string,
    capacity: string,
    paymentMethods: string[],
    pmrAccess: boolean | null,
): string {
    return JSON.stringify({ name, serviceDays, serviceHours, enabledTags, enabledCerts, addressLabel, addressLat, addressLon, email, phone, capacity, paymentMethods, pmrAccess });
}

// ────────────────────────────────────────────────────────────────────────────
// Composant ligne catégorie (principal ou sous-catégorie)
// ────────────────────────────────────────────────────────────────────────────
interface CategoryRowProps {
    category: MenuCategory;
    index: number;
    total: number;
    foodBeverageIcons: typeof iconsData;
    onUpdate: (id: number, data: Partial<{ label: string; icon: string; is_highlighted: boolean; color_key: string | null }>) => void;
    onDelete: (id: number) => void;
    onMove: (id: number, direction: 'up' | 'down') => void;
    indent?: boolean;
}

function CategoryRow({ category, index, total, foodBeverageIcons, onUpdate, onDelete, onMove, indent = false }: CategoryRowProps) {
    const [label, setLabel] = useState(category.label);

    const handleLabelBlur = () => {
        if (label.trim() && label !== category.label) {
            onUpdate(category.id, { label: label.trim() });
        }
    };

    // Sync if external update
    useEffect(() => { setLabel(category.label); }, [category.label]);

    return (
        <div className={`flex items-center gap-2 p-3 bg-muted/50 rounded-lg ${indent ? 'ml-8 border-l-2 border-border' : ''}`}>
            {/* Réorder */}
            <div className="flex flex-col gap-0.5">
                <button
                    onClick={() => onMove(category.id, 'up')}
                    disabled={index === 0}
                    className={`p-1 rounded hover:bg-muted ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                    title="Monter"
                >
                    <ArrowUp className="w-3 h-3" />
                </button>
                <button
                    onClick={() => onMove(category.id, 'down')}
                    disabled={index === total - 1}
                    className={`p-1 rounded hover:bg-muted ${index === total - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                    title="Descendre"
                >
                    <ArrowDown className="w-3 h-3" />
                </button>
            </div>

            {/* Icône */}
            <IconPicker
                value={category.icon as IconName}
                onValueChange={(icon) => onUpdate(category.id, { icon })}
                iconsList={foodBeverageIcons}
                categorized={false}
                searchPlaceholder="Rechercher..."
                triggerPlaceholder="Icône"
            >
                <Button variant="outline" size="icon" className="w-10 h-10 shrink-0">
                    <Icon name={category.icon as IconName} className="w-5 h-5" />
                </Button>
            </IconPicker>

            {/* Nom */}
            <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={handleLabelBlur}
                className="flex-1"
                placeholder="Nom de la catégorie"
            />

            {/* Palette couleur */}
            {!category.is_highlighted && (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="w-8 h-8 shrink-0 border-0"
                            title="Couleur de la catégorie"
                            style={category.color_key ? {
                                backgroundColor: COLOR_KEY_MAP[category.color_key]?.bg,
                            } : undefined}
                        >
                            <Palette
                                className="w-5 h-5"
                                style={{ color: category.color_key ? COLOR_KEY_MAP[category.color_key]?.label : undefined }}
                            />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="center">
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries(COLOR_KEY_MAP).map(([key, color]) => (
                                <button
                                    key={key}
                                    type="button"
                                    title={key}
                                    onClick={() => onUpdate(category.id, { color_key: key })}
                                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                                    style={{
                                        backgroundColor: color.bg,
                                        outline: category.color_key === key ? `3px solid ${color.border}` : 'none',
                                        outlineOffset: '2px',
                                    }}
                                >
                                    {category.color_key === key && (
                                        <Check className="w-4 h-4" style={{ color: color.label }} strokeWidth={3} />
                                    )}
                                </button>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
            )}

            {/* Mise en avant (highlight) */}
            {!(category.subcategories && category.subcategories.length > 0) ? (
                <button
                    onClick={() => onUpdate(category.id, { is_highlighted: !category.is_highlighted })}
                    title={category.is_highlighted ? 'Retirer la mise en avant' : 'Mettre en avant (items affichés en grand)'}
                    className={`p-2 rounded-lg transition-colors ${
                        category.is_highlighted
                            ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
                    }`}
                >
                    {category.is_highlighted ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                </button>
            ) : (
                <div className="w-10 h-10 shrink-0" />
            )}

            {/* Supprimer */}
            {category.is_protected ? (
                <div className="p-2 text-muted-foreground/40" title="Cette catégorie ne peut pas être supprimée">
                    <Lock className="w-4 h-4" />
                </div>
            ) : (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(category.id)}
                    className="text-destructive hover:text-destructive shrink-0"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Page principale
// ────────────────────────────────────────────────────────────────────────────
export function SettingsPage() {
    const location = useLocation();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Taxonomy
    const [tagCategories, setTagCategories] = useState<DietaryTagCategory[]>([]);
    const [certCategories, setCertCategories] = useState<CertificationCategory[]>([]);

    // Icônes food
    const foodBeverageIcons = useMemo(() =>
        iconsData.filter(icon => icon.categories.includes('food-beverage')),
        []
    );

    // Settings généraux
    const [name, setName] = useState('');
    const [serviceDays, setServiceDays] = useState<number[]>([0, 1, 2, 3, 4]);
    const [serviceHours, setServiceHours] = useState<ServiceHours>({});
    const [sameHoursForAll, setSameHoursForAll] = useState(true);
    const [enabledTags, setEnabledTags] = useState<string[]>([]);
    const [enabledCerts, setEnabledCerts] = useState<string[]>([]);

    // Adresse BAN
    const [addressLabel, setAddressLabel] = useState('');
    const [addressLat, setAddressLat] = useState<number | null>(null);
    const [addressLon, setAddressLon] = useState<number | null>(null);
    const [addressConfirmed, setAddressConfirmed] = useState(false);
    const [banSuggestions, setBanSuggestions] = useState<BanSuggestion[]>([]);
    const [banOpen, setBanOpen] = useState(false);
    const banDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Contact & infos
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [capacity, setCapacity] = useState('');
    const [paymentMethods, setPaymentMethods] = useState<string[]>(['izly', 'cb']);
    const [pmrAccess, setPmrAccess] = useState<boolean | null>(null);

    const originalStateRef = useRef<string>('');

    // Catégories (DB-backed, CRUD direct)
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [catLoading, setCatLoading] = useState(false);
    const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
    const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

    const hasChanges = useMemo(() => {
        if (isLoading || originalStateRef.current === '') return false;
        return serializeState(name, serviceDays, serviceHours, enabledTags, enabledCerts, addressLabel, addressLat, addressLon, email, phone, capacity, paymentMethods, pmrAccess) !== originalStateRef.current;
    }, [name, serviceDays, serviceHours, enabledTags, enabledCerts, addressLabel, addressLat, addressLon, email, phone, capacity, paymentMethods, pmrAccess, isLoading]);

    // ── Chargement ──────────────────────────────────────────────────────────
    const loadCategories = useCallback(async () => {
        setCatLoading(true);
        try {
            const { categories: cats } = await categoriesApi.list();
            setCategories(cats);
        } catch {
            // ignore
        } finally {
            setCatLoading(false);
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const [taxonomy, data] = await Promise.all([
                    publicApi.getTaxonomy().catch(() => null),
                    adminApi.getSettings(),
                ]);

                if (taxonomy) {
                    setTagCategories(taxonomy.dietary_tag_categories || []);
                    setCertCategories(taxonomy.certification_categories || []);
                }

                const loadedName = data.name || '';
                const loadedServiceDays = data.config?.service_days || [0, 1, 2, 3, 4];
                const loadedServiceHours: ServiceHours = data.config?.service_hours || {};
                const loadedTags = (data.config?.dietary_tags || []).map((t: DietaryTag) => t.id);
                const loadedCerts = (data.config?.certifications || []).map((c: CertificationItem) => c.id);
                const loadedAddressLabel = data.address_label || '';
                const loadedEmail = data.email || '';
                const loadedPhone = data.phone || '';
                const loadedCapacity = data.capacity != null ? String(data.capacity) : '';
                const loadedPayments = data.payment_methods || ['izly', 'cb'];
                const loadedPmr = data.pmr_access ?? null;

                // Determine if all active days share the same hours
                const hourValues = Object.values(loadedServiceHours);
                const allSame = hourValues.length > 0 && hourValues.every(
                    h => h.open === hourValues[0].open && h.close === hourValues[0].close
                );

                const loadedLat = data.address_lat ?? null;
                const loadedLon = data.address_lon ?? null;

                setName(loadedName);
                setServiceDays(loadedServiceDays);
                setServiceHours(loadedServiceHours);
                setSameHoursForAll(hourValues.length === 0 || allSame);
                setEnabledTags(loadedTags);
                setEnabledCerts(loadedCerts);
                setAddressLabel(loadedAddressLabel);
                setAddressLat(loadedLat);
                setAddressLon(loadedLon);
                setAddressConfirmed(!loadedAddressLabel || (loadedLat != null && loadedLon != null));
                setEmail(loadedEmail);
                setPhone(loadedPhone);
                setCapacity(loadedCapacity);
                setPaymentMethods(loadedPayments);
                setPmrAccess(loadedPmr);
                originalStateRef.current = serializeState(loadedName, loadedServiceDays, loadedServiceHours, loadedTags, loadedCerts, loadedAddressLabel, loadedLat, loadedLon, loadedEmail, loadedPhone, loadedCapacity, loadedPayments, loadedPmr);
            } catch (error) {
                console.error('Erreur chargement:', error);
            } finally {
                setIsLoading(false);
            }
        };
        load();
        loadCategories();
    }, [loadCategories]);

    // Avertissement avant de quitter
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const anchor = (e.target as HTMLElement).closest('a');
            if (anchor?.href && hasChanges) {
                const url = new URL(anchor.href);
                if (url.pathname !== location.pathname) {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingNavHref(anchor.href);
                }
            }
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [hasChanges, location.pathname]);

    // ── Sauvegarde paramètres généraux ──────────────────────────────────────
    const handleSave = async () => {
        // Validate before sending
        const eErr = validateEmail(email);
        const pErr = validatePhone(phone);
        setEmailError(eErr);
        setPhoneError(pErr);
        const addressErr = !!addressLabel && !addressConfirmed;
        if (eErr || pErr || addressErr) return;

        setIsSaving(true);
        setMessage(null);
        try {
            const saved = await adminApi.updateSettings({
                name,
                service_days: serviceDays,
                service_hours: serviceHours,
                address_label: addressLabel || null,
                address_lat: addressLat,
                address_lon: addressLon,
                email: email || null,
                phone: phone || null,
                capacity: capacity ? Number(capacity) : null,
                payment_methods: paymentMethods,
                pmr_access: pmrAccess,
                dietary_tags: enabledTags,
                certifications: enabledCerts,
            }) as RestaurantWithConfig;

            // Reload canonical state from the server response to guarantee consistency
            const savedLabel = saved.address_label || '';
            const savedLat = saved.address_lat ?? null;
            const savedLon = saved.address_lon ?? null;
            const savedEmail = saved.email || '';
            const savedPhone = saved.phone || '';
            const savedCapacity = saved.capacity != null ? String(saved.capacity) : '';
            const savedPayments = saved.payment_methods || [];
            const savedPmr = saved.pmr_access ?? null;
            const savedDays = saved.config?.service_days ?? serviceDays;
            const savedHours = saved.config?.service_hours ?? serviceHours;
            const savedTags = (saved.config?.dietary_tags || []).map((t: DietaryTag) => t.id);
            const savedCerts = (saved.config?.certifications || []).map((c: CertificationItem) => c.id);

            setName(saved.name || name);
            setAddressLabel(savedLabel);
            setAddressLat(savedLat);
            setAddressLon(savedLon);
            setAddressConfirmed(!savedLabel || (savedLat != null && savedLon != null));
            setEmail(savedEmail);
            setPhone(savedPhone);
            setCapacity(savedCapacity);
            setPaymentMethods(savedPayments);
            setPmrAccess(savedPmr);
            setServiceDays(savedDays);
            setServiceHours(savedHours);
            setEnabledTags(savedTags);
            setEnabledCerts(savedCerts);

            originalStateRef.current = serializeState(saved.name || name, savedDays, savedHours, savedTags, savedCerts, savedLabel, savedLat, savedLon, savedEmail, savedPhone, savedCapacity, savedPayments, savedPmr);
            setMessage({ type: 'success', text: 'Paramètres enregistrés !' });
        } catch {
            setMessage({ type: 'error', text: "Erreur lors de l'enregistrement" });
        } finally {
            setIsSaving(false);
        }
    };

    // ── Jours de service ────────────────────────────────────────────────────
    const toggleDay = (day: number) => {
        setServiceDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
    };

    // ── CRUD Catégories (DB direct) ──────────────────────────────────────────
    const handleCategoryUpdate = async (id: number, data: Partial<{ label: string; icon: string; is_highlighted: boolean; color_key: string | null }>) => {
        try {
            const updated = await categoriesApi.update(id, data);
            setCategories(prev => prev.map(c => {
                if (c.id === id) return { ...c, ...updated };
                // Mettre à jour dans les sous-catégories
                if (c.subcategories?.some(s => s.id === id)) {
                    return {
                        ...c,
                        subcategories: c.subcategories.map(s => s.id === id ? { ...s, ...updated } : s),
                    };
                }
                return c;
            }));
        } catch {
            setMessage({ type: 'error', text: 'Erreur lors de la mise à jour de la catégorie' });
        }
    };

    const handleCategoryDelete = (id: number) => {
        setDeletingCategoryId(id);
    };

    const confirmCategoryDelete = async () => {
        if (!deletingCategoryId) return;
        try {
            await categoriesApi.delete(deletingCategoryId);
            await loadCategories();
        } catch {
            setMessage({ type: 'error', text: 'Impossible de supprimer cette catégorie' });
        } finally {
            setDeletingCategoryId(null);
        }
    };

    const handleCategoryMove = async (id: number, direction: 'up' | 'down') => {
        // Trouver dans la liste de top-level
        const topLevel = categories.filter(c => c.parent_id === null);
        const idx = topLevel.findIndex(c => c.id === id);
        if (idx === -1) {
            // Chercher dans les sous-catégories
            for (const parent of categories) {
                const subs = parent.subcategories || [];
                const subIdx = subs.findIndex(s => s.id === id);
                if (subIdx !== -1) {
                    const targetIdx = direction === 'up' ? subIdx - 1 : subIdx + 1;
                    if (targetIdx < 0 || targetIdx >= subs.length) return;
                    const items = subs.map((s, i) => ({ id: s.id, order: i }));
                    // Swap
                    [items[subIdx].order, items[targetIdx].order] = [items[targetIdx].order, items[subIdx].order];
                    await categoriesApi.reorder(items);
                    await loadCategories();
                    return;
                }
            }
            return;
        }
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= topLevel.length) return;
        const items = topLevel.map((c, i) => ({ id: c.id, order: i }));
        [items[idx].order, items[targetIdx].order] = [items[targetIdx].order, items[idx].order];
        await categoriesApi.reorder(items);
        await loadCategories();
    };

    const handleAddCategory = async () => {
        try {
            await categoriesApi.create({ label: 'Nouvelle catégorie', icon: 'utensils', order: categories.length });
            await loadCategories();
        } catch {
            setMessage({ type: 'error', text: "Erreur lors de la création de la catégorie" });
        }
    };

    const handleAddSubcategory = async (parentId: number) => {
        try {
            const parent = categories.find(c => c.id === parentId);
            const subCount = parent?.subcategories?.length ?? 0;
            await categoriesApi.create({ label: 'Nouvelle sous-catégorie', icon: 'utensils', order: subCount, parent_id: parentId });
            await loadCategories();
        } catch {
            setMessage({ type: 'error', text: "Erreur lors de la création de la sous-catégorie" });
        }
    };

    // ── Tags / Certifications ────────────────────────────────────────────────
    const toggleTag = (tagId: string) => {
        setEnabledTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
    };
    const toggleCert = (certId: string) => {
        setEnabledCerts(prev => prev.includes(certId) ? prev.filter(c => c !== certId) : [...prev, certId]);
    };

    if (isLoading) {
        return (
            <div className="container-mariam py-8 flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
                <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="gap-2">
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
                        <CardDescription>Nom, coordonnées et capacité du restaurant</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="name">Nom du restaurant</Label>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Restaurant Universitaire" />
                        </div>

                        {/* Adresse BAN */}
                        <div>
                            <Label htmlFor="address">Adresse</Label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    id="address"
                                    value={addressLabel}
                                    className="pl-9"
                                    placeholder="Rechercher une adresse…"
                                    autoComplete="off"
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setAddressLabel(val);
                                        setAddressConfirmed(!val);
                                        setAddressLat(null);
                                        setAddressLon(null);
                                        if (!val) { setBanSuggestions([]); setBanOpen(false); return; }
                                        if (banDebounceRef.current) clearTimeout(banDebounceRef.current);
                                        banDebounceRef.current = setTimeout(async () => {
                                            const suggestions = await banApi.search(val);
                                            setBanSuggestions(suggestions);
                                            setBanOpen(suggestions.length > 0);
                                        }, 300);
                                    }}
                                    onBlur={() => setTimeout(() => setBanOpen(false), 150)}
                                    onFocus={() => banSuggestions.length > 0 && setBanOpen(true)}
                                />
                                {banOpen && banSuggestions.length > 0 && (
                                    <ul className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                                        {banSuggestions.map((s, i) => (
                                            <li
                                                key={i}
                                                className="px-4 py-2.5 text-sm cursor-pointer hover:bg-muted transition-colors"
                                                onMouseDown={() => {
                                                    setAddressLabel(s.label);
                                                    setAddressLat(s.lat);
                                                    setAddressLon(s.lon);
                                                    setAddressConfirmed(true);
                                                    setBanSuggestions([]);
                                                    setBanOpen(false);
                                                }}
                                            >
                                                {s.label}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            {addressLabel && !addressConfirmed && (
                                <p className="mt-1 text-xs text-destructive">
                                    Sélectionnez une adresse dans la liste pour la valider.
                                </p>
                            )}
                            {addressConfirmed && addressLat != null && addressLon != null && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {addressLat.toFixed(5)}, {addressLon.toFixed(5)}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
                                    onBlur={(e) => setEmailError(validateEmail(e.target.value))}
                                    placeholder="contact@ru.fr"
                                    className={emailError ? 'border-destructive focus-visible:ring-destructive' : ''}
                                />
                                {emailError && <p className="mt-1 text-xs text-destructive">{emailError}</p>}
                            </div>
                            <div>
                                <Label htmlFor="phone">Téléphone</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => { setPhone(e.target.value); if (phoneError) setPhoneError(null); }}
                                    onBlur={(e) => setPhoneError(validatePhone(e.target.value))}
                                    placeholder="+33 1 23 45 67 89"
                                    className={phoneError ? 'border-destructive focus-visible:ring-destructive' : ''}
                                />
                                {phoneError && <p className="mt-1 text-xs text-destructive">{phoneError}</p>}
                            </div>
                        </div>

                        <div className="sm:w-1/3">
                            <Label htmlFor="capacity">Capacité d'accueil</Label>
                            <Input
                                id="capacity"
                                type="number"
                                min={10}
                                max={10000}
                                step={10}
                                value={capacity}
                                onChange={(e) => setCapacity(e.target.value)}
                                onBlur={(e) => {
                                    const raw = Number(e.target.value);
                                    if (!e.target.value || isNaN(raw)) { setCapacity(''); return; }
                                    const clamped = Math.min(10000, Math.max(10, Math.round(raw / 10) * 10));
                                    setCapacity(String(clamped));
                                }}
                                placeholder="Nombre de couverts"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Jours de service + horaires */}
                <Card>
                    <CardHeader>
                        <CardTitle>Jours et horaires de service</CardTitle>
                        <CardDescription>Sélectionnez les jours d'ouverture et les horaires associés</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="flex flex-wrap gap-2">
                            {DAY_NAMES.map((day, index) => (
                                <button
                                    key={index}
                                    onClick={() => toggleDay(index)}
                                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                                        serviceDays.includes(index)
                                            ? 'border-primary bg-primary/10 text-primary font-medium'
                                            : 'border-border text-muted-foreground hover:border-muted-foreground'
                                    }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {serviceDays.length} jour{serviceDays.length > 1 ? 's' : ''} de service par semaine
                        </p>

                        {serviceDays.length > 0 && (
                            <div className="space-y-4 pt-2 border-t border-border">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={sameHoursForAll}
                                        onChange={(e) => {
                                            setSameHoursForAll(e.target.checked);
                                            if (e.target.checked) {
                                                const first = Object.values(serviceHours)[0] ?? { open: '11:30', close: '14:00' };
                                                const unified: ServiceHours = {};
                                                serviceDays.forEach(d => { unified[String(d)] = { ...first }; });
                                                setServiceHours(unified);
                                            }
                                        }}
                                        className="rounded"
                                    />
                                    <span className="text-sm font-medium">Mêmes horaires pour tous les jours</span>
                                </label>

                                {sameHoursForAll ? (
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1 block">Ouverture</Label>
                                            <Input
                                                type="time"
                                                className="w-32"
                                                value={Object.values(serviceHours)[0]?.open ?? '11:30'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setServiceHours(prev => {
                                                        const next: ServiceHours = {};
                                                        serviceDays.forEach(d => { next[String(d)] = { open: val, close: prev[String(d)]?.close ?? '14:00' }; });
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </div>
                                        <span className="text-muted-foreground mt-5">→</span>
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1 block">Fermeture</Label>
                                            <Input
                                                type="time"
                                                className="w-32"
                                                value={Object.values(serviceHours)[0]?.close ?? '14:00'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setServiceHours(prev => {
                                                        const next: ServiceHours = {};
                                                        serviceDays.forEach(d => { next[String(d)] = { open: prev[String(d)]?.open ?? '11:30', close: val }; });
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {[...serviceDays].sort((a, b) => a - b).map(d => (
                                            <div key={d} className="flex items-center gap-4">
                                                <span className="w-24 text-sm font-medium">{DAY_NAMES[d]}</span>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground mb-1 block">Ouverture</Label>
                                                    <Input
                                                        type="time"
                                                        className="w-32"
                                                        value={serviceHours[String(d)]?.open ?? '11:30'}
                                                        onChange={(e) => setServiceHours(prev => ({
                                                            ...prev,
                                                            [String(d)]: { open: e.target.value, close: prev[String(d)]?.close ?? '14:00' },
                                                        }))}
                                                    />
                                                </div>
                                                <span className="text-muted-foreground mt-5">→</span>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground mb-1 block">Fermeture</Label>
                                                    <Input
                                                        type="time"
                                                        className="w-32"
                                                        value={serviceHours[String(d)]?.close ?? '14:00'}
                                                        onChange={(e) => setServiceHours(prev => ({
                                                            ...prev,
                                                            [String(d)]: { open: prev[String(d)]?.open ?? '11:30', close: e.target.value },
                                                        }))}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Accessibilité & paiements */}
                <Card>
                    <CardHeader>
                        <CardTitle>Accessibilité & paiements</CardTitle>
                        <CardDescription>Informations pratiques affichées dans la fiche du restaurant</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <Label className="flex items-center gap-1.5 mb-3">
                                <Accessibility className="w-4 h-4" />
                                Accessibilité PMR
                            </Label>
                            <div className="flex items-center gap-4">
                                {([null, true, false] as const).map((val) => (
                                    <label key={String(val)} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                        <input
                                            type="radio"
                                            name="pmr_access"
                                            checked={pmrAccess === val}
                                            onChange={() => setPmrAccess(val)}
                                        />
                                        {val === null ? 'Non renseigné' : val ? 'Accessible' : 'Non accessible'}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label className="flex items-center gap-1.5 mb-3">
                                <CreditCard className="w-4 h-4" />
                                Méthodes de paiement acceptées
                            </Label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {PAYMENT_OPTIONS.map((opt) => (
                                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer text-sm p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={paymentMethods.includes(opt.id)}
                                            onChange={(e) => setPaymentMethods(prev =>
                                                e.target.checked ? [...prev, opt.id] : prev.filter(m => m !== opt.id)
                                            )}
                                            className="rounded"
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Catégories de menu — CRUD DB */}
                <Card>
                    <CardHeader>
                        <CardTitle>Catégories de menu</CardTitle>
                        <CardDescription>
                            Les modifications sont enregistrées immédiatement.
                            L'étoile <Star className="inline w-3 h-3 text-amber-500" /> indique les catégories principales pour l'affichage du menu public.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {catLoading ? (
                            <div className="flex justify-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {categories.map((cat, index) => (
                                    <div key={cat.id}>
                                        <CategoryRow
                                            category={cat}
                                            index={index}
                                            total={categories.length}
                                            foodBeverageIcons={foodBeverageIcons}
                                            onUpdate={handleCategoryUpdate}
                                            onDelete={handleCategoryDelete}
                                            onMove={handleCategoryMove}
                                        />

                                        {/* Sous-catégories */}
                                        {(cat.subcategories && cat.subcategories.length > 0) && (
                                            <div className="mt-2 space-y-2">
                                                {cat.subcategories.map((sub, subIndex) => (
                                                    <CategoryRow
                                                        key={sub.id}
                                                        category={sub}
                                                        index={subIndex}
                                                        total={cat.subcategories!.length}
                                                        foodBeverageIcons={foodBeverageIcons}
                                                        onUpdate={handleCategoryUpdate}
                                                        onDelete={handleCategoryDelete}
                                                        onMove={handleCategoryMove}
                                                        indent
                                                    />
                                                ))}
                                                <button
                                                    onClick={() => handleAddSubcategory(cat.id)}
                                                    className="ml-8 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Ajouter une sous-catégorie à « {cat.label} »
                                                </button>
                                            </div>
                                        )}

                                        {(!cat.subcategories || cat.subcategories.length === 0) && cat.is_protected && (
                                            <button
                                                onClick={() => handleAddSubcategory(cat.id)}
                                                className="ml-8 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1 mt-1"
                                            >
                                                <ChevronRight className="w-3.5 h-3.5" />
                                                <Plus className="w-3.5 h-3.5" />
                                                Ajouter une sous-catégorie
                                            </button>
                                        )}
                                    </div>
                                ))}

                                <Button variant="outline" onClick={handleAddCategory} className="mt-4 gap-2">
                                    <Plus className="w-4 h-4" />
                                    Ajouter une catégorie principale
                                </Button>
                            </div>
                        )}
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
                                            className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                                                enabledTags.includes(tag.id)
                                                    ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
                                                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                                            }`}
                                        >
                                            <Icon name={tag.icon as IconName} className="w-4 h-4" />
                                            <span>{tag.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {tagCategories.length === 0 && <p className="text-sm text-muted-foreground italic">Chargement des tags…</p>}
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
                                                className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all flex items-start gap-3 ${
                                                    isActive
                                                        ? 'border-blue-500 bg-blue-500/10'
                                                        : 'border-border hover:border-muted-foreground'
                                                }`}
                                            >
                                                <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="w-8 h-8 object-contain shrink-0 mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-sm font-medium leading-tight ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
                                                        {cert.official_name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{cert.guarantee}</p>
                                                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 break-words">{cert.issuer}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        {certCategories.length === 0 && <p className="text-sm text-muted-foreground italic">Chargement des certifications…</p>}
                    </CardContent>
                </Card>
            </div>

            {/* Footer */}
            <div className="mt-8 flex justify-end">
                <Button onClick={handleSave} disabled={isSaving || !hasChanges} size="lg" className="gap-2">
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
                </Button>
            </div>

            <AlertDialog open={pendingNavHref !== null} onOpenChange={open => { if (!open) setPendingNavHref(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Modifications non sauvegardées</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vous avez des modifications non enregistrées. Si vous continuez, elles seront perdues.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPendingNavHref(null)}>Rester</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { if (pendingNavHref) window.location.href = pendingNavHref; }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Quitter sans sauvegarder
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={deletingCategoryId !== null} onOpenChange={open => { if (!open) setDeletingCategoryId(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette catégorie ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Les items associés à cette catégorie seront également supprimés.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingCategoryId(null)}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmCategoryDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
