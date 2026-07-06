import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    catalogApi, categoriesApi, publicApi,
    DishCatalogItem, MenuCategory, DietaryTag, CertificationItem,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
    Plus, Search, BookOpen, Pencil, Trash2, ImagePlus, X, ChevronDown, LayoutGrid, List, Loader2, Upload,
} from 'lucide-react';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/toast';
import { flattenCategories, leafCategories, normalizeDishName } from './catalogue/utils';
import { CatalogueImportDialog } from './catalogue/CatalogueImportDialog';

type SortOption = 'usage' | 'name' | 'recent';
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'usage', label: 'Plus utilisés' },
    { value: 'name', label: 'Nom A→Z' },
    { value: 'recent', label: 'Plus récents' },
];

// ── Dish card ──────────────────────────────────────────────────────────────
function DishCard({ dish, onEdit }: { dish: DishCatalogItem; onEdit: () => void }) {
    return (
        <button
            onClick={onEdit}
            className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden text-left hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
        >
            {/* Image */}
            <div className="aspect-square w-full bg-muted flex items-center justify-center overflow-hidden">
                {dish.image_url ? (
                    <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" />
                ) : (
                    <BookOpen className="w-10 h-10 text-muted-foreground/30" />
                )}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-1 p-3">
                <p className="font-semibold text-sm leading-tight line-clamp-2">{dish.name}</p>
                <p className="text-xs text-muted-foreground">
                    {dish.usage_count > 0
                        ? `Utilisé ${dish.usage_count} fois`
                        : 'Non utilisé'}
                </p>
                {(dish.tags.length > 0 || dish.certifications.length > 0) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {dish.tags.slice(0, 2).map(t => (
                            <span
                                key={t.id}
                                className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-muted border border-border"
                                style={{ color: t.color }}
                                title={t.label}
                            >
                                <Icon name={t.icon as IconName} className="w-2.5 h-2.5 shrink-0" />
                                <span className="text-muted-foreground">{t.label}</span>
                            </span>
                        ))}
                        {dish.certifications.slice(0, 2).map(c => (
                            <span
                                key={c.id}
                                className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-100"
                                title={c.name}
                            >
                                <img src={`/certifications/${c.logo_filename}`} alt={c.name} className="h-3 w-3 object-contain" />
                            </span>
                        ))}
                        {dish.tags.length + dish.certifications.length > 4 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                +{dish.tags.length + dish.certifications.length - 4}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Edit overlay hint */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="bg-background/90 rounded-lg p-1.5 shadow-sm flex items-center">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </span>
            </div>
        </button>
    );
}

// ── Dish row (list view) ───────────────────────────────────────────────────
function DishRow({ dish, onEdit }: { dish: DishCatalogItem; onEdit: () => void }) {
    return (
        <button
            onClick={onEdit}
            className="group flex items-center gap-3 w-full p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left"
        >
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                {dish.image_url ? (
                    <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" />
                ) : (
                    <BookOpen className="w-4 h-4 text-muted-foreground/30" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{dish.name}</p>
                <p className="text-xs text-muted-foreground">
                    {dish.usage_count > 0
                        ? `${dish.usage_count} utilisation${dish.usage_count > 1 ? 's' : ''}`
                        : 'Non utilisé'}
                </p>
            </div>
            {(dish.tags.length > 0 || dish.certifications.length > 0) && (
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                    {dish.tags.slice(0, 3).map(t => (
                        <span
                            key={t.id}
                            className="flex items-center justify-center w-5 h-5 rounded-full border border-border bg-muted"
                            style={{ color: t.color }}
                            title={t.label}
                        >
                            <Icon name={t.icon as IconName} className="w-3 h-3" />
                        </span>
                    ))}
                    {dish.certifications.slice(0, 2).map(c => (
                        <span key={c.id} className="flex items-center justify-center w-5 h-5" title={c.name}>
                            <img src={`/certifications/${c.logo_filename}`} alt={c.name} className="h-4 w-4 object-contain" />
                        </span>
                    ))}
                    {dish.tags.length + dish.certifications.length > 5 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            +{dish.tags.length + dish.certifications.length - 5}
                        </span>
                    )}
                </div>
            )}
            <Pencil className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
        </button>
    );
}

// ── Image upload zone ──────────────────────────────────────────────────────
function ImageUploadZone({
    imageUrl, onUpload, onRemove, loading,
}: {
    imageUrl: string | null;
    onUpload: (file: File) => void;
    onRemove: () => void;
    loading: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="relative w-full aspect-video rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
            {imageUrl ? (
                <>
                    <img src={imageUrl} alt="Aperçu" className="w-full h-full object-cover" />
                    <button
                        type="button"
                        onClick={onRemove}
                        disabled={loading}
                        className="absolute top-2 right-2 bg-background/90 rounded-full p-1 shadow hover:bg-destructive hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={loading}
                    className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors py-4"
                >
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-sm">Ajouter une photo</span>
                </button>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }}
            />
        </div>
    );
}

// ── Drawer form ───────────────────────────────────────────────────────────
interface DrawerFormProps {
    open: boolean;
    dish: DishCatalogItem | null;
    categories: MenuCategory[];
    allTags: DietaryTag[];
    allCerts: CertificationItem[];
    onClose: () => void;
    onSaved: (dish: DishCatalogItem) => void;
    onDeleted: (id: number) => void;
}

function DishDrawer({ open, dish, categories, allTags, allCerts, onClose, onSaved, onDeleted }: DrawerFormProps) {
    const isCreating = dish === null;
    const [name, setName] = useState('');
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [selectedCertIds, setSelectedCertIds] = useState<string[]>([]);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [imgLoading, setImgLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Populate fields when dish changes or drawer opens
    useEffect(() => {
        if (!open) return;
        setName(dish?.name ?? '');
        setCategoryId(dish?.category_id ?? null);
        setSelectedTagIds(dish?.tags.map(t => t.id) ?? []);
        setSelectedCertIds(dish?.certifications.map(c => c.id) ?? []);
        setImageUrl(dish?.image_url ?? null);
        setError(null);
    }, [open, dish]);

    const handleSave = async () => {
        const trimmed = normalizeDishName(name);
        if (!trimmed) { setError('Le nom est requis.'); return; }
        setSaving(true);
        setError(null);
        try {
            const payload = {
                name: trimmed,
                category_id: categoryId,
                tag_ids: selectedTagIds,
                certification_ids: selectedCertIds,
            };
            const saved = isCreating
                ? await catalogApi.create(payload)
                : await catalogApi.update(dish!.id, payload);
            notify.success(isCreating ? 'Plat créé' : 'Modifications enregistrées');
            onSaved(saved);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg ?? 'Une erreur est survenue.');
        } finally {
            setSaving(false);
        }
    };

    const handleUploadImage = async (file: File) => {
        if (!dish) return;
        setImgLoading(true);
        try {
            const updated = await catalogApi.uploadImage(dish.id, file);
            setImageUrl(updated.image_url);
            onSaved(updated);
        } catch {
            setError("Erreur lors de l'upload.");
        } finally {
            setImgLoading(false);
        }
    };

    const handleRemoveImage = async () => {
        if (!dish) return;
        setImgLoading(true);
        try {
            await catalogApi.removeImage(dish.id);
            setImageUrl(null);
            onSaved({ ...dish, image_url: null });
        } catch {
            setError("Erreur lors de la suppression de l'image.");
        } finally {
            setImgLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!dish) return;
        setSaving(true);
        try {
            await catalogApi.delete(dish.id);
            notify.success('Plat supprimé');
            onDeleted(dish.id);
            setDeleteConfirm(false);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg ?? 'Impossible de supprimer ce plat.');
            setDeleteConfirm(false);
        } finally {
            setSaving(false);
        }
    };

    const toggleTag = (id: string) =>
        setSelectedTagIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const toggleCert = (id: string) =>
        setSelectedCertIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const leafCats = leafCategories(categories);

    return (
        <>
            <Sheet open={open} onOpenChange={v => !v && onClose()}>
                <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-y-auto">
                    <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
                        <SheetTitle>{isCreating ? 'Nouveau plat' : 'Modifier le plat'}</SheetTitle>
                    </SheetHeader>

                    <div className="flex flex-col gap-5 px-6 py-5 flex-1">
                        {/* Image (only when editing) */}
                        {!isCreating && (
                            <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Photo</Label>
                                <ImageUploadZone
                                    imageUrl={imageUrl}
                                    onUpload={handleUploadImage}
                                    onRemove={handleRemoveImage}
                                    loading={imgLoading}
                                />
                            </div>
                        )}

                        {/* Name */}
                        <div>
                            <Label htmlFor="dish-name" className="text-xs text-muted-foreground mb-1.5 block">
                                Nom du plat <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="dish-name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Ex: Saumon grillé"
                                className="h-10"
                                onKeyDown={e => e.key === 'Enter' && handleSave()}
                            />
                        </div>

                        {/* Category */}
                        <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Catégorie</Label>
                            <div className="relative">
                                <select
                                    value={categoryId ?? ''}
                                    onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full h-10 px-3 pr-8 rounded-md border border-input bg-background text-sm appearance-none"
                                >
                                    <option value="">— Aucune catégorie —</option>
                                    {leafCats.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        {/* Tags */}
                        {allTags.length > 0 && (
                            <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Labels alimentaires</Label>
                                <div className="flex flex-wrap gap-2">
                                    {allTags.map(tag => {
                                        const active = selectedTagIds.includes(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => toggleTag(tag.id)}
                                                className={cn(
                                                    'text-xs px-2.5 py-1.5 rounded-xl border transition-colors',
                                                    active
                                                        ? 'bg-primary text-primary-foreground border-primary'
                                                        : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                                                )}
                                            >
                                                {tag.icon && (
                                                    <Icon name={tag.icon as IconName} className="w-3.5 h-3.5 shrink-0" />
                                                )}
                                                {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Certifications */}
                        {allCerts.length > 0 && (
                            <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Certifications</Label>
                                <div className="flex flex-wrap gap-2">
                                    {allCerts.map(cert => {
                                        const active = selectedCertIds.includes(cert.id);
                                        return (
                                            <button
                                                key={cert.id}
                                                type="button"
                                                onClick={() => toggleCert(cert.id)}
                                                className={cn(
                                                    'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-colors',
                                                    active
                                                        ? 'bg-primary text-primary-foreground border-primary'
                                                        : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                                                )}
                                            >
                                                {cert.logo_filename && (
                                                    <img src={`/certifications/${cert.logo_filename}`} alt="" className="h-3.5 w-3.5 object-contain shrink-0" />
                                                )}
                                                {cert.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {error && (
                            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
                        )}
                    </div>

                    <SheetFooter className="px-6 py-4 border-t border-border flex flex-col gap-2 sm:flex-col">
                        <Button onClick={handleSave} disabled={saving || imgLoading} className="w-full">
                            {saving ? 'Enregistrement…' : isCreating ? 'Créer le plat' : 'Enregistrer'}
                        </Button>
                        {!isCreating && (
                            <Button
                                variant="ghost"
                                onClick={() => setDeleteConfirm(true)}
                                disabled={saving}
                                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Supprimer
                            </Button>
                        )}
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Delete confirmation */}
            <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer ce plat ?</DialogTitle>
                        <DialogDescription>
                            {dish && dish.usage_count > 0
                                ? `Ce plat est utilisé dans ${dish.usage_count} menu(s) et ne peut pas être supprimé.`
                                : `« ${dish?.name} » sera définitivement supprimé. Cette action est irréversible.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setDeleteConfirm(false)}>Annuler</Button>
                        {dish && dish.usage_count === 0 && (
                            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                                {saving ? 'Suppression…' : 'Supprimer'}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ── Skeleton card ──────────────────────────────────────────────────────────
function DishCardSkeleton() {
    return (
        <div className="flex flex-col rounded-2xl border border-border overflow-hidden">
            <Skeleton className="aspect-square w-full" />
            <div className="p-3 flex flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────
const PER_PAGE = 24;

export function CataloguePage() {
    const navigate = useNavigate();

    // Metadata (loaded once)
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [allTags, setAllTags] = useState<DietaryTag[]>([]);
    const [allCerts, setAllCerts] = useState<CertificationItem[]>([]);
    const [metaLoaded, setMetaLoaded] = useState(false);

    // Paginated dishes
    const [allDishes, setAllDishes] = useState<DishCatalogItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('usage');
    const [categoryFilter, setCategoryFilter] = useState<number | ''>('');

    // UI
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(
        () => (localStorage.getItem('mariam-catalogue-view') as 'grid' | 'list') ?? 'grid'
    );
    const sentinelRef = useRef<HTMLDivElement>(null);

    const toggleView = (mode: 'grid' | 'list') => {
        setViewMode(mode);
        localStorage.setItem('mariam-catalogue-view', mode);
    };

    // Load metadata once
    useEffect(() => {
        Promise.all([categoriesApi.list(), publicApi.getTaxonomy()]).then(([catData, taxonomy]) => {
            setCategories(catData.categories);
            setAllTags(taxonomy.dietary_tag_categories.flatMap(c => c.tags));
            setAllCerts(taxonomy.certification_categories.flatMap(c => c.certifications));
            setMetaLoaded(true);
        });
    }, []);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Reset pagination when filters change (or after a bulk import)
    useEffect(() => {
        setAllDishes([]);
        setPage(1);
        setHasMore(true);
        setTotal(0);
        setLoading(true);
    }, [debouncedSearch, sort, categoryFilter, reloadKey]);

    // Fetch page
    useEffect(() => {
        let cancelled = false;

        const fetchPage = async () => {
            if (page > 1) setIsFetchingMore(true);

            try {
                const result = await catalogApi.listPaginated({
                    q: debouncedSearch.trim() || undefined,
                    category_id: categoryFilter || undefined,
                    sort,
                    page,
                    per_page: PER_PAGE,
                });
                if (!cancelled) {
                    setAllDishes(prev => page === 1 ? result.dishes : [...prev, ...result.dishes]);
                    setTotal(result.total);
                    setHasMore(result.has_more);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setIsFetchingMore(false);
                }
            }
        };

        fetchPage();
        return () => { cancelled = true; };
    }, [page, debouncedSearch, sort, categoryFilter, reloadKey]);

    // IntersectionObserver sentinel
    const setupObserver = useCallback(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasMore || loading || isFetchingMore) return;

        const observer = new IntersectionObserver(
            entries => { if (entries[0].isIntersecting) setPage(p => p + 1); },
            { threshold: 0.1 },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loading, isFetchingMore]);

    useEffect(setupObserver, [setupObserver]);

    const flatCats = flattenCategories(categories);
    const openEdit = (dish: DishCatalogItem) => navigate(`/admin/catalogue/${dish.id}`);

    const handleSaved = (saved: DishCatalogItem) => {
        setAllDishes(prev => {
            const idx = prev.findIndex(d => d.id === saved.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
            }
            setTotal(t => t + 1);
            return [saved, ...prev];
        });
        setDrawerOpen(false);
        navigate(`/admin/catalogue/${saved.id}`);
    };

    const handleDeleted = (id: number) => {
        setAllDishes(prev => prev.filter(d => d.id !== id));
        setTotal(t => Math.max(0, t - 1));
        setDrawerOpen(false);
    };

    const isEmpty = !loading && allDishes.length === 0;
    const isFiltered = Boolean(debouncedSearch.trim() || categoryFilter);

    return (
        <div className="container-mariam py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Catalogue</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {loading ? '…' : `${total} plat${total !== 1 ? 's' : ''}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
                        <button
                            type="button"
                            onClick={() => toggleView('grid')}
                            className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                            aria-label="Vue grille"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleView('list')}
                            className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
                            aria-label="Vue liste"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>
                    <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Importer</span>
                    </Button>
                    <Button onClick={() => setDrawerOpen(true)} className="gap-2">
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Ajouter un plat</span>
                        <span className="sm:hidden">Ajouter</span>
                    </Button>
                </div>
            </div>

            <CatalogueImportDialog
                open={importOpen}
                categories={categories}
                allTags={allTags}
                allCerts={allCerts}
                onClose={() => setImportOpen(false)}
                onImported={() => setReloadKey(k => k + 1)}
            />

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-6">
                {/* Search */}
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher un plat…"
                        className="pl-9 h-9"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Category filter */}
                <div className="relative">
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : '')}
                        className="h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer"
                    >
                        <option value="">Toutes catégories</option>
                        {flatCats.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>

                {/* Sort */}
                <div className="relative">
                    <select
                        value={sort}
                        onChange={e => setSort(e.target.value as SortOption)}
                        className="h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer"
                    >
                        {SORT_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
            </div>

            {/* Dish list */}
            {loading ? (
                viewMode === 'list' ? (
                    <div className="flex flex-col gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                                <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <Skeleton className="h-4 w-1/2" />
                                    <Skeleton className="h-3 w-1/4" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => <DishCardSkeleton key={i} />)}
                    </div>
                )
            ) : isEmpty ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
                    {!isFiltered ? (
                        <>
                            <p className="text-base font-medium">Votre catalogue est vide</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                Commencez par créer votre premier plat, ou lancez l'onboarding de menu pour alimenter le catalogue automatiquement.
                            </p>
                            <Button onClick={() => setDrawerOpen(true)} className="mt-6 gap-2">
                                <Plus className="w-4 h-4" />
                                Créer un plat
                            </Button>
                        </>
                    ) : (
                        <>
                            <p className="text-base font-medium">Aucun résultat</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Essayez une autre recherche ou un autre filtre.
                            </p>
                        </>
                    )}
                </div>
            ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                    {allDishes.map(dish => (
                        <DishRow key={dish.id} dish={dish} onEdit={() => openEdit(dish)} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {allDishes.map(dish => (
                        <DishCard key={dish.id} dish={dish} onEdit={() => openEdit(dish)} />
                    ))}
                </div>
            )}

            {/* Infinite scroll sentinel + spinner */}
            {!loading && hasMore && (
                <div ref={sentinelRef} className="py-6 flex justify-center">
                    {isFetchingMore && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                </div>
            )}

            {/* Results count when searching */}
            {!loading && !hasMore && isFiltered && allDishes.length > 0 && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                    {total} résultat{total !== 1 ? 's' : ''} pour « {debouncedSearch || flatCats.find(c => c.id === categoryFilter)?.label} »
                </p>
            )}

            <DishDrawer
                open={drawerOpen}
                dish={null}
                categories={metaLoaded ? categories : []}
                allTags={allTags}
                allCerts={allCerts}
                onClose={() => setDrawerOpen(false)}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
            />
        </div>
    );
}
