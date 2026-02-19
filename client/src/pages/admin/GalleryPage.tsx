/**
 * MARIAM - Galerie de photos
 *
 * Page d'administration pour parcourir, rechercher, tagger et supprimer
 * les photos de la galerie partagée.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    galleryApi, adminApi,
    GalleryImage, GalleryImageTag, GalleryListResponse,
    MenuCategory,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
    Image as ImageIcon, Search, Upload, Trash2, X, Tag, ChevronLeft, ChevronRight,
    Eye, Plus, SlidersHorizontal, ArrowUpDown, LayoutGrid, Check,
} from 'lucide-react';

const PER_PAGE = 24;

type SortOption = 'recent' | 'oldest' | 'usage';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'recent', label: 'Plus récentes' },
    { value: 'oldest', label: 'Plus anciennes' },
    { value: 'usage', label: 'Plus utilisées' },
];

const DEFAULT_CATEGORIES: MenuCategory[] = [
    { id: 'entree', label: 'Entrée', icon: 'salad', order: 1 },
    { id: 'plat', label: 'Plat principal', icon: 'utensils', order: 2 },
    { id: 'vg', label: 'Option végétarienne', icon: 'leaf', order: 3 },
    { id: 'dessert', label: 'Dessert', icon: 'cake-slice', order: 4 },
];

const TAG_TYPE_COLORS: Record<string, string> = {
    dish: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    category: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    manual: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
};

export function GalleryPage() {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('recent');
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [loading, setLoading] = useState(true);

    // Categories from config
    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);

    // Detail modal
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Tag editing
    const [newTagName, setNewTagName] = useState('');

    // Upload
    const uploadRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Filter dropdown open
    const [filterOpen, setFilterOpen] = useState(false);

    // Load categories
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const data = await adminApi.getSettings();
                if (data?.config?.menu_categories) {
                    setCategories(data.config.menu_categories);
                }
            } catch {
                // keep defaults
            }
        };
        loadConfig();
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Load images
    const loadImages = useCallback(async () => {
        setLoading(true);
        try {
            const data: GalleryListResponse = await galleryApi.list({
                q: debouncedSearch || undefined,
                category: categoryFilter || undefined,
                page,
                per_page: PER_PAGE,
                sort,
            });
            setImages(data.images);
            setTotal(data.total);
            setPages(data.pages);
        } catch (err) {
            console.error('Erreur chargement galerie:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, categoryFilter, page, sort]);

    useEffect(() => {
        loadImages();
    }, [loadImages]);

    // Open detail
    const openDetail = async (img: GalleryImage) => {
        setSelectedImage(img);
        setDetailLoading(true);
        try {
            const full = await galleryApi.get(img.id);
            setSelectedImage(full);
        } catch (err) {
            console.error('Erreur chargement détail:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    // Upload new images
    const handleUpload = async (files: FileList) => {
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                await galleryApi.upload(file);
            }
            await loadImages();
        } catch (err) {
            console.error('Erreur upload:', err);
        } finally {
            setUploading(false);
        }
    };

    // Delete image
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await galleryApi.delete(deleteTarget.id);
            if (selectedImage?.id === deleteTarget.id) setSelectedImage(null);
            setDeleteTarget(null);
            await loadImages();
        } catch (err) {
            console.error('Erreur suppression:', err);
        } finally {
            setDeleting(false);
        }
    };

    // Add tag
    const handleAddTag = async () => {
        if (!selectedImage || !newTagName.trim()) return;
        try {
            const newTag = await galleryApi.addTag(selectedImage.id, newTagName.trim());
            setSelectedImage(prev =>
                prev ? { ...prev, tags: [...(prev.tags || []), newTag] } : prev
            );
            setNewTagName('');
        } catch (err) {
            console.error('Erreur ajout tag:', err);
        }
    };

    // Delete tag
    const handleDeleteTag = async (tag: GalleryImageTag) => {
        if (!selectedImage || tag.tag_type === 'category') return;
        try {
            await galleryApi.deleteTag(selectedImage.id, tag.id);
            setSelectedImage(prev =>
                prev ? { ...prev, tags: (prev.tags || []).filter(t => t.id !== tag.id) } : prev
            );
        } catch (err) {
            console.error('Erreur suppression tag:', err);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'short', year: 'numeric',
        });
    };

    const formatSize = (bytes?: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} o`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
        return `${(bytes / 1048576).toFixed(1)} Mo`;
    };

    const activeFilterCount = (categoryFilter ? 1 : 0) + (sort !== 'recent' ? 1 : 0);
    const activeSortLabel = SORT_OPTIONS.find(s => s.value === sort)?.label || '';
    const activeCategoryLabel = categories.find(c => c.id === categoryFilter)?.label || '';

    return (
        <div className="container-mariam py-6">
            <div className="space-y-4 sm:space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                            Galerie photos
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {total} photo{total !== 1 ? 's' : ''} dans la galerie
                        </p>
                    </div>
                    <div>
                        <input
                            ref={uploadRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                if (e.target.files?.length) handleUpload(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        <Button
                            onClick={() => uploadRef.current?.click()}
                            disabled={uploading}
                            className="gap-2 w-full sm:w-auto"
                        >
                            <Upload className="w-4 h-4" />
                            {uploading ? 'Upload...' : 'Ajouter des photos'}
                        </Button>
                    </div>
                </div>

                {/* Search + filter bar */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher par tag, nom de plat..."
                            className="pl-10"
                        />
                    </div>

                    {/* Filter dropdown */}
                    <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className="gap-2 shrink-0 relative"
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                <span className="hidden sm:inline">Filtres</span>
                                {activeFilterCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-0">
                            {/* Tri */}
                            <div className="px-4 pt-4 pb-3 border-b border-border">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <ArrowUpDown className="w-3.5 h-3.5" />
                                    Tri
                                </p>
                                <div className="space-y-1">
                                    {SORT_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => { setSort(opt.value); setPage(1); }}
                                            className={`w-full text-left text-sm px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                                                sort === opt.value
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'text-foreground hover:bg-muted'
                                            }`}
                                        >
                                            {opt.label}
                                            {sort === opt.value && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Catégorie */}
                            <div className="px-4 pt-3 pb-4">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <LayoutGrid className="w-3.5 h-3.5" />
                                    Catégorie
                                </p>
                                <div className="space-y-1">
                                    <button
                                        type="button"
                                        onClick={() => { setCategoryFilter(''); setPage(1); }}
                                        className={`w-full text-left text-sm px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                                            !categoryFilter
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        Toutes les catégories
                                        {!categoryFilter && <Check className="w-4 h-4" />}
                                    </button>
                                    {categories.sort((a, b) => a.order - b.order).map(cat => (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => { setCategoryFilter(cat.id); setPage(1); }}
                                            className={`w-full text-left text-sm px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                                                categoryFilter === cat.id
                                                    ? 'bg-primary/10 text-primary font-medium'
                                                    : 'text-foreground hover:bg-muted'
                                            }`}
                                        >
                                            {cat.label}
                                            {categoryFilter === cat.id && <Check className="w-4 h-4" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Reset */}
                            {activeFilterCount > 0 && (
                                <div className="px-4 pb-4">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-muted-foreground"
                                        onClick={() => {
                                            setSort('recent');
                                            setCategoryFilter('');
                                            setPage(1);
                                        }}
                                    >
                                        Réinitialiser les filtres
                                    </Button>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Active filter chips */}
                {activeFilterCount > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {sort !== 'recent' && (
                            <Badge variant="secondary" className="gap-1.5 text-xs cursor-pointer" onClick={() => { setSort('recent'); setPage(1); }}>
                                {activeSortLabel}
                                <X className="w-3 h-3" />
                            </Badge>
                        )}
                        {categoryFilter && (
                            <Badge variant="secondary" className="gap-1.5 text-xs cursor-pointer" onClick={() => { setCategoryFilter(''); setPage(1); }}>
                                {activeCategoryLabel}
                                <X className="w-3 h-3" />
                            </Badge>
                        )}
                    </div>
                )}

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
                        ))}
                    </div>
                ) : images.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                            <p className="text-muted-foreground">
                                {debouncedSearch || categoryFilter
                                    ? 'Aucune photo trouvée pour ces critères.'
                                    : 'La galerie est vide. Ajoutez des photos depuis l\'éditeur de menu ou via le bouton ci-dessus.'}
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                        {images.map(img => (
                            <button
                                key={img.id}
                                onClick={() => openDetail(img)}
                                className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <img
                                    src={img.url}
                                    alt={img.filename || 'Photo'}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                                {/* Overlay on hover */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 sm:p-2">
                                        {img.tags?.length > 0 && (
                                            <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                                {img.tags.slice(0, 2).map(tag => (
                                                    <span
                                                        key={tag.id}
                                                        className="text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm truncate max-w-[80px]"
                                                    >
                                                        {tag.name}
                                                    </span>
                                                ))}
                                                {img.tags.length > 2 && (
                                                    <span className="text-[9px] sm:text-[10px] px-1 py-0.5 text-white/70">
                                                        +{img.tags.length - 2}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Usage count badge */}
                                {(img.usage_count ?? 0) > 0 && (
                                    <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 bg-primary text-primary-foreground text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                                        {img.usage_count}×
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {pages > 1 && (
                    <div className="flex items-center justify-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Page {page} / {pages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= pages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                )}

                {/* Detail dialog */}
                <Dialog open={!!selectedImage} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        {selectedImage && (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <Eye className="w-5 h-5" />
                                        Détail de la photo
                                    </DialogTitle>
                                    <DialogDescription>
                                        {selectedImage.filename || `Photo #${selectedImage.id}`}
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Image preview */}
                                    <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                                        <img
                                            src={selectedImage.url}
                                            alt={selectedImage.filename || 'Photo'}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>

                                    {/* Metadata + tags */}
                                    <div className="space-y-4">
                                        {/* Info */}
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Ajoutée le</span>
                                                <span>{formatDate(selectedImage.created_at)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Taille</span>
                                                <span>{formatSize(selectedImage.file_size)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Type</span>
                                                <span>{selectedImage.mime_type || '—'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Utilisée dans</span>
                                                <span>{selectedImage.usage_count ?? 0} menu{(selectedImage.usage_count ?? 0) > 1 ? 's' : ''}</span>
                                            </div>
                                        </div>

                                        {/* Tags */}
                                        <div>
                                            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                                                <Tag className="w-4 h-4" />
                                                Tags
                                            </p>
                                            {detailLoading ? (
                                                <div className="flex gap-1">
                                                    {[1, 2, 3].map(i => (
                                                        <div key={i} className="h-6 w-16 rounded-full bg-muted animate-pulse" />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5 mb-2">
                                                    {(selectedImage.tags || []).map(tag => (
                                                        <Badge
                                                            key={tag.id}
                                                            variant="outline"
                                                            className={`text-xs gap-1 ${TAG_TYPE_COLORS[tag.tag_type] || ''}`}
                                                        >
                                                            {tag.name}
                                                            {tag.tag_type !== 'category' && (
                                                                <button
                                                                    onClick={() => handleDeleteTag(tag)}
                                                                    className="ml-0.5 hover:text-destructive"
                                                                    title="Supprimer ce tag"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </Badge>
                                                    ))}
                                                    {(selectedImage.tags || []).length === 0 && (
                                                        <span className="text-xs text-muted-foreground italic">Aucun tag</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Add tag */}
                                            <div className="flex gap-1.5 mt-2">
                                                <Input
                                                    value={newTagName}
                                                    onChange={(e) => setNewTagName(e.target.value)}
                                                    placeholder="Nouveau tag..."
                                                    className="h-8 text-sm"
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={handleAddTag}
                                                    disabled={!newTagName.trim()}
                                                    className="h-8 px-2"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <DialogFooter className="gap-2 sm:gap-0">
                                    <Button
                                        variant="destructive"
                                        onClick={() => setDeleteTarget(selectedImage)}
                                        className="gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Supprimer
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Delete confirm dialog */}
                <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Confirmer la suppression</DialogTitle>
                            <DialogDescription>
                                Cette photo sera supprimée définitivement du stockage et dissociée de tous les menus.
                                Cette action est irréversible.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                                Annuler
                            </Button>
                            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                                {deleting ? 'Suppression...' : 'Supprimer'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
