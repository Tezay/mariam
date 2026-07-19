import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  catalogApi,
  categoriesApi,
  publicApi,
  DishCatalogItem,
  MenuCategory,
  DietaryTag,
  CertificationItem,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus,
  Search,
  BookOpen,
  Pencil,
  Trash2,
  ImagePlus,
  X,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  Upload,
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
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:border-primary/40 hover:shadow-md"
    >
      {/* Image */}
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
        {dish.image_url ? (
          <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
        ) : (
          <BookOpen className="h-10 w-10 text-muted-foreground/30" />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{dish.name}</p>
        <p className="text-xs text-muted-foreground">
          {dish.usage_count > 0 ? `Utilisé ${dish.usage_count} fois` : 'Non utilisé'}
        </p>
        {(dish.tags.length > 0 || dish.certifications.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {dish.tags.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs"
                style={{ color: t.color }}
                title={t.label}
              >
                <Icon name={t.icon as IconName} className="h-2.5 w-2.5 shrink-0" />
                <span className="text-muted-foreground">{t.label}</span>
              </span>
            ))}
            {dish.certifications.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-0.5 rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-xs"
                title={c.name}
              >
                <img
                  src={`/certifications/${c.logo_filename}`}
                  alt={c.name}
                  className="h-3 w-3 object-contain"
                />
              </span>
            ))}
            {dish.tags.length + dish.certifications.length > 4 && (
              <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                +{dish.tags.length + dish.certifications.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Edit overlay hint */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="flex items-center rounded-lg bg-background/90 p-1.5 shadow-sm">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
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
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {dish.image_url ? (
          <img src={dish.image_url} alt={dish.name} className="h-full w-full object-cover" />
        ) : (
          <BookOpen className="h-4 w-4 text-muted-foreground/30" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{dish.name}</p>
        <p className="text-xs text-muted-foreground">
          {dish.usage_count > 0
            ? `${dish.usage_count} utilisation${dish.usage_count > 1 ? 's' : ''}`
            : 'Non utilisé'}
        </p>
      </div>
      {(dish.tags.length > 0 || dish.certifications.length > 0) && (
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          {dish.tags.slice(0, 3).map((t) => (
            <span
              key={t.id}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted"
              style={{ color: t.color }}
              title={t.label}
            >
              <Icon name={t.icon as IconName} className="h-3 w-3" />
            </span>
          ))}
          {dish.certifications.slice(0, 2).map((c) => (
            <span key={c.id} className="flex h-5 w-5 items-center justify-center" title={c.name}>
              <img
                src={`/certifications/${c.logo_filename}`}
                alt={c.name}
                className="h-4 w-4 object-contain"
              />
            </span>
          ))}
          {dish.tags.length + dish.certifications.length > 5 && (
            <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              +{dish.tags.length + dish.certifications.length - 5}
            </span>
          )}
        </div>
      )}
      <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </button>
  );
}

// ── Image upload zone ──────────────────────────────────────────────────────
function ImageUploadZone({
  imageUrl,
  onUpload,
  onRemove,
  loading,
}: {
  imageUrl: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="Aperçu" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={onRemove}
            disabled={loading}
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow transition-colors hover:bg-destructive hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="flex flex-col items-center gap-2 py-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm">Ajouter une photo</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onUpload(e.target.files[0]);
        }}
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

function DishDrawer({
  open,
  dish,
  categories,
  allTags,
  allCerts,
  onClose,
  onSaved,
  onDeleted,
}: DrawerFormProps) {
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
    setSelectedTagIds(dish?.tags.map((t) => t.id) ?? []);
    setSelectedCertIds(dish?.certifications.map((c) => c.id) ?? []);
    setImageUrl(dish?.image_url ?? null);
    setError(null);
  }, [open, dish]);

  const handleSave = async () => {
    const trimmed = normalizeDishName(name);
    if (!trimmed) {
      setError('Le nom est requis.');
      return;
    }
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
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleCert = (id: string) =>
    setSelectedCertIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const leafCats = leafCategories(categories);

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border px-6 pb-4 pt-6">
            <SheetTitle>{isCreating ? 'Nouveau plat' : 'Modifier le plat'}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 px-6 py-5">
            {/* Image (only when editing) */}
            {!isCreating && (
              <div>
                <Label className="mb-2 block text-xs text-muted-foreground">Photo</Label>
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
              <Label htmlFor="dish-name" className="mb-1.5 block text-xs text-muted-foreground">
                Nom du plat <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dish-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Saumon grillé"
                className="h-10"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>

            {/* Category */}
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Catégorie</Label>
              <div className="relative">
                <select
                  value={categoryId ?? ''}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                  className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm"
                >
                  <option value="">— Aucune catégorie —</option>
                  {leafCats.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
              <div>
                <Label className="mb-2 block text-xs text-muted-foreground">
                  Labels alimentaires
                </Label>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
                        )}
                      >
                        {tag.icon && (
                          <Icon name={tag.icon as IconName} className="h-3.5 w-3.5 shrink-0" />
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
                <Label className="mb-2 block text-xs text-muted-foreground">Certifications</Label>
                <div className="flex flex-wrap gap-2">
                  {allCerts.map((cert) => {
                    const active = selectedCertIds.includes(cert.id);
                    return (
                      <button
                        key={cert.id}
                        type="button"
                        onClick={() => toggleCert(cert.id)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
                        )}
                      >
                        {cert.logo_filename && (
                          <img
                            src={`/certifications/${cert.logo_filename}`}
                            alt=""
                            className="h-3.5 w-3.5 shrink-0 object-contain"
                          />
                        )}
                        {cert.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <SheetFooter className="flex flex-col gap-2 border-t border-border px-6 py-4 sm:flex-col">
            <Button onClick={handleSave} disabled={saving || imgLoading} className="w-full">
              {saving ? 'Enregistrement…' : isCreating ? 'Créer le plat' : 'Enregistrer'}
            </Button>
            {!isCreating && (
              <Button
                variant="ghost"
                onClick={() => setDeleteConfirm(true)}
                disabled={saving}
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
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
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
              Annuler
            </Button>
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
      <Skeleton className="aspect-square w-full" />
      <div className="flex flex-col gap-1.5 p-3">
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
      setAllTags(taxonomy.dietary_tag_categories.flatMap((c) => c.tags));
      setAllCerts(taxonomy.certification_categories.flatMap((c) => c.certifications));
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
          setAllDishes((prev) => (page === 1 ? result.dishes : [...prev, ...result.dishes]));
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
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, sort, categoryFilter, reloadKey]);

  // IntersectionObserver sentinel
  const setupObserver = useCallback(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || isFetchingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setPage((p) => p + 1);
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, isFetchingMore]);

  useEffect(setupObserver, [setupObserver]);

  const flatCats = flattenCategories(categories);
  const openEdit = (dish: DishCatalogItem) => navigate(`/admin/catalogue/${dish.id}`);

  const handleSaved = (saved: DishCatalogItem) => {
    setAllDishes((prev) => {
      const idx = prev.findIndex((d) => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      setTotal((t) => t + 1);
      return [saved, ...prev];
    });
    setDrawerOpen(false);
    navigate(`/admin/catalogue/${saved.id}`);
  };

  const handleDeleted = (id: number) => {
    setAllDishes((prev) => prev.filter((d) => d.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    setDrawerOpen(false);
  };

  const isEmpty = !loading && allDishes.length === 0;
  const isFiltered = Boolean(debouncedSearch.trim() || categoryFilter);

  return (
    <div className="container-mariam py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catalogue</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? '…' : `${total} plat${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
            <button
              type="button"
              onClick={() => toggleView('grid')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'grid'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Vue grille"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleView('list')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Vue liste"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Importer</span>
          </Button>
          <Button onClick={() => setDrawerOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
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
        onImported={() => setReloadKey((k) => k + 1)}
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un plat…"
            className="h-9 pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : '')}
            className="h-9 cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm"
          >
            <option value="">Toutes catégories</option>
            {flatCats.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="h-9 cursor-pointer appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Dish list */}
      {loading ? (
        viewMode === 'list' ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <DishCardSkeleton key={i} />
            ))}
          </div>
        )
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/30" />
          {!isFiltered ? (
            <>
              <p className="text-base font-medium">Votre catalogue est vide</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Commencez par créer votre premier plat, ou lancez l'onboarding de menu pour
                alimenter le catalogue automatiquement.
              </p>
              <Button onClick={() => setDrawerOpen(true)} className="mt-6 gap-2">
                <Plus className="h-4 w-4" />
                Créer un plat
              </Button>
            </>
          ) : (
            <>
              <p className="text-base font-medium">Aucun résultat</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Essayez une autre recherche ou un autre filtre.
              </p>
            </>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-2">
          {allDishes.map((dish) => (
            <DishRow key={dish.id} dish={dish} onEdit={() => openEdit(dish)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {allDishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} onEdit={() => openEdit(dish)} />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel + spinner */}
      {!loading && hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {isFetchingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      )}

      {/* Results count when searching */}
      {!loading && !hasMore && isFiltered && allDishes.length > 0 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {total} résultat{total !== 1 ? 's' : ''} pour «{' '}
          {debouncedSearch || flatCats.find((c) => c.id === categoryFilter)?.label} »
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
