/**
 * MARIAM - Sélecteur d'images depuis la galerie
 *
 * Modal permettant de parcourir la galerie de photos de plats
 * et d'en sélectionner une pour un item de menu.
 * Inclut recherche, filtres par catégorie et tri.
 */
import { useState, useEffect, useCallback } from 'react';
import { galleryApi, GalleryImage, MenuCategory } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
    Search, X, Check, ImageIcon, Loader2,
    SlidersHorizontal, ArrowUpDown, LayoutGrid, ChevronLeft, ChevronRight,
} from 'lucide-react';

type SortOption = 'recent' | 'oldest' | 'usage';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: 'recent', label: 'Plus récentes' },
    { value: 'oldest', label: 'Plus anciennes' },
    { value: 'usage', label: 'Plus utilisées' },
];

interface GalleryPickerProps {
    /** Fermer le picker */
    onClose: () => void;
    /** Callback avec l'image sélectionnée */
    onSelect: (image: GalleryImage) => void;
    /** IDs déjà sélectionnées (afficher un check) */
    excludeIds?: number[];
    /** Catégorie par défaut (pré-sélectionnée mais modifiable) */
    defaultCategory?: string;
    /** Catégories disponibles pour le filtre */
    categories?: MenuCategory[];
    /** ID du restaurant */
    restaurantId?: number;
}

export function GalleryPicker({
    onClose,
    onSelect,
    excludeIds = [],
    defaultCategory,
    categories = [],
    restaurantId,
}: GalleryPickerProps) {
    const [images, setImages] = useState<GalleryImage[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sort, setSort] = useState<SortOption>('recent');
    const [categoryFilter, setCategoryFilter] = useState<string>(defaultCategory || '');
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);

    const PER_PAGE = 24;

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
            const data = await galleryApi.list({
                page,
                per_page: PER_PAGE,
                q: debouncedSearch || undefined,
                category: categoryFilter || undefined,
                sort,
                restaurant_id: restaurantId,
            });
            setImages(data.images);
            setTotal(data.total);
            setPages(data.pages);
        } catch (err) {
            console.error('Erreur chargement galerie:', err);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, categoryFilter, sort, page, restaurantId]);

    useEffect(() => {
        loadImages();
    }, [loadImages]);

    const handleConfirm = () => {
        if (selectedId === null) return;
        const img = images.find(i => i.id === selectedId);
        if (img) onSelect(img);
    };

    const activeFilterCount = (categoryFilter ? 1 : 0) + (sort !== 'recent' ? 1 : 0);
    const activeSortLabel = SORT_OPTIONS.find(s => s.value === sort)?.label || '';
    const activeCategoryLabel = categories.find(c => c.id === categoryFilter)?.label || categoryFilter || '';

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />

            {/* Modal — full-screen on mobile, centered on desktop */}
            <div className="fixed inset-0 sm:inset-4 md:inset-8 lg:inset-16 bg-card sm:rounded-xl border-0 sm:border border-border shadow-2xl z-[61] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">Galerie de photos</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            {total} photo{total > 1 ? 's' : ''} disponible{total > 1 ? 's' : ''}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search + filter bar */}
                <div className="px-4 sm:px-6 py-3 border-b border-border shrink-0 space-y-2">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher par nom de plat, tag..."
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
                            <PopoverContent align="end" className="w-72 p-0 z-[70]">
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
                                {categories.length > 0 && (
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
                                )}

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
                        <div className="flex flex-wrap gap-1.5">
                            {sort !== 'recent' && (
                                <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => { setSort('recent'); setPage(1); }}>
                                    {activeSortLabel}
                                    <X className="w-3 h-3" />
                                </Badge>
                            )}
                            {categoryFilter && (
                                <Badge variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => { setCategoryFilter(''); setPage(1); }}>
                                    {activeCategoryLabel}
                                    <X className="w-3 h-3" />
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                {/* Image grid */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : images.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <ImageIcon className="w-12 h-12 mb-3 opacity-50" />
                            <p className="text-base sm:text-lg font-medium">Aucune photo</p>
                            <p className="text-xs sm:text-sm text-center px-4">
                                {search || categoryFilter
                                    ? 'Aucun résultat pour ces critères de recherche'
                                    : 'Uploadez des photos depuis l\'éditeur de menu'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                            {images.map((img) => {
                                const isExcluded = excludeIds.includes(img.id);
                                const isSelected = selectedId === img.id;
                                return (
                                    <button
                                        key={img.id}
                                        type="button"
                                        disabled={isExcluded}
                                        onClick={() => setSelectedId(isSelected ? null : img.id)}
                                        className={`
                                            relative group aspect-square rounded-lg overflow-hidden border-2 transition-all
                                            ${isExcluded
                                                ? 'opacity-40 cursor-not-allowed border-border'
                                                : isSelected
                                                    ? 'border-primary ring-2 ring-primary/30'
                                                    : 'border-border hover:border-primary/50'
                                            }
                                        `}
                                    >
                                        <img
                                            src={img.url}
                                            alt={img.filename || 'Photo'}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        {/* Tags overlay */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 sm:p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                                {img.tags.slice(0, 2).map((tag) => (
                                                    <span
                                                        key={tag.id}
                                                        className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full truncate max-w-[70px] sm:max-w-[80px] ${
                                                            tag.tag_type === 'category'
                                                                ? 'bg-blue-500/80 text-white'
                                                                : tag.tag_type === 'dish'
                                                                    ? 'bg-green-500/80 text-white'
                                                                    : 'bg-white/30 text-white'
                                                        }`}
                                                    >
                                                        {tag.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Selected indicator */}
                                        {isSelected && (
                                            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-primary text-primary-foreground rounded-full p-0.5 sm:p-1">
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}
                                        {/* Already used indicator */}
                                        {isExcluded && (
                                            <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 bg-muted text-muted-foreground rounded-full p-0.5 sm:p-1">
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Pagination + actions */}
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-border shrink-0 gap-3 sm:gap-0">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                        {pages > 1 && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    {page} / {pages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= pages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
                            Annuler
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={selectedId === null}
                            className="flex-1 sm:flex-none"
                        >
                            Sélectionner
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}
