import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    catalogApi, categoriesApi, publicApi,
    DishCatalogItem, DishStats, MenuCategory, DietaryTag, CertificationItem,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandInput, CommandEmpty, CommandList, CommandItem } from '@/components/ui/command';
import {
    ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    BarChart, Bar,
} from 'recharts';
import { ArrowLeft, Pencil, BookOpen, BarChart2, TrendingUp, Scale, Trash2 } from 'lucide-react';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/toast';
import { leafCategories, normalizeDishName } from './utils';

// ── Inline edit drawer (reused from CataloguePage pattern) ───────────────
interface EditDrawerProps {
    open: boolean;
    dish: DishCatalogItem;
    categories: MenuCategory[];
    allTags: DietaryTag[];
    allCerts: CertificationItem[];
    onClose: () => void;
    onSaved: (dish: DishCatalogItem) => void;
    onDeleted: () => void;
}

function EditDrawer({ open, dish, categories, allTags, allCerts, onClose, onSaved, onDeleted }: EditDrawerProps) {
    const [name, setName] = useState(dish.name);
    const [categoryId, setCategoryId] = useState<number | null>(dish.category_id);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(dish.tags.map(t => t.id));
    const [selectedCertIds, setSelectedCertIds] = useState<string[]>(dish.certifications.map(c => c.id));
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setName(dish.name);
        setCategoryId(dish.category_id);
        setSelectedTagIds(dish.tags.map(t => t.id));
        setSelectedCertIds(dish.certifications.map(c => c.id));
        setError(null);
    }, [open, dish]);

    const handleSave = async () => {
        const trimmed = normalizeDishName(name);
        if (!trimmed) { setError('Le nom est requis.'); return; }
        setSaving(true);
        setError(null);
        try {
            const saved = await catalogApi.update(dish.id, {
                name: trimmed,
                category_id: categoryId,
                tag_ids: selectedTagIds,
                certification_ids: selectedCertIds,
            });
            notify.success('Modifications enregistrées');
            onSaved(saved);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setError(msg ?? 'Une erreur est survenue.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setSaving(true);
        try {
            await catalogApi.delete(dish.id);
            notify.success('Plat supprimé');
            onDeleted();
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
                        <SheetTitle>Modifier le plat</SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-5 px-6 py-5 flex-1">
                        <div>
                            <Label htmlFor="dish-name" className="text-xs text-muted-foreground mb-1.5 block">
                                Nom <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="dish-name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="h-10"
                                onKeyDown={e => e.key === 'Enter' && handleSave()}
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground mb-1.5 block">Catégorie</Label>
                            <select
                                value={categoryId ?? ''}
                                onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                            >
                                <option value="">— Aucune catégorie —</option>
                                {leafCats.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                        {allTags.length > 0 && (
                            <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Labels alimentaires</Label>
                                <div className="flex flex-wrap gap-2">
                                    {allTags.map(tag => (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => toggleTag(tag.id)}
                                            className={cn(
                                                'text-xs px-2.5 py-1.5 rounded-xl border transition-colors',
                                                selectedTagIds.includes(tag.id)
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                                            )}
                                        >
                                            {tag.icon && (
                                                <Icon name={tag.icon as IconName} className="w-3.5 h-3.5 shrink-0" />
                                            )}
                                            {tag.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {allCerts.length > 0 && (
                            <div>
                                <Label className="text-xs text-muted-foreground mb-2 block">Certifications</Label>
                                <div className="flex flex-wrap gap-2">
                                    {allCerts.map(cert => (
                                        <button
                                            key={cert.id}
                                            type="button"
                                            onClick={() => toggleCert(cert.id)}
                                            className={cn(
                                                'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-colors',
                                                selectedCertIds.includes(cert.id)
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                                            )}
                                        >
                                            {cert.logo_filename && (
                                                <img src={`/certifications/${cert.logo_filename}`} alt="" className="h-3.5 w-3.5 object-contain shrink-0" />
                                            )}
                                            {cert.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {error && (
                            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
                        )}
                    </div>
                    <SheetFooter className="px-6 py-4 border-t border-border flex flex-col gap-2 sm:flex-col">
                        <Button onClick={handleSave} disabled={saving} className="w-full">
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                        {dish.usage_count === 0 && (
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

            <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer « {dish.name} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cette action est irréversible. Le plat sera définitivement supprimé du catalogue.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
    return (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">fois au menu</p>
        </div>
    );
}

// ── Compare modal ─────────────────────────────────────────────────────────
interface CompareModalProps {
    dish: DishCatalogItem;
    stats: DishStats;
    allDishes: DishCatalogItem[];
    open: boolean;
    onClose: () => void;
}

function CompareModal({ dish, stats, allDishes, open, onClose }: CompareModalProps) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<DishCatalogItem[]>([]);
    const [compareStats, setCompareStats] = useState<Record<number, DishStats>>({});

    const filteredDishes = allDishes.filter(d =>
        d.id !== dish.id &&
        !selected.find(s => s.id === d.id) &&
        d.name.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 8);

    const addDish = useCallback(async (d: DishCatalogItem) => {
        if (selected.length >= 2) return;
        const newSelected = [...selected, d];
        setSelected(newSelected);
        if (!compareStats[d.id]) {
            const s = await catalogApi.getStats(d.id);
            setCompareStats(prev => ({ ...prev, [d.id]: s }));
        }
    }, [selected, compareStats]);

    const removeDish = (id: number) => {
        setSelected(prev => prev.filter(d => d.id !== id));
    };

    // Build chart data: merge history arrays by week key
    const allDishesInCompare = [{ dish, stats }, ...selected.map(d => ({ dish: d, stats: compareStats[d.id] })).filter(x => x.stats)];
    const weekKeys = new Set<string>();
    allDishesInCompare.forEach(({ stats: s }) => s?.history.forEach(h => weekKeys.add(h.week)));
    const sortedWeeks = Array.from(weekKeys).sort().slice(-12);

    const chartData = sortedWeeks.map(week => {
        const point: Record<string, number | string> = { week: week.replace(/\d{4}-W/, 'S') };
        allDishesInCompare.forEach(({ dish: d, stats: s }) => {
            const entry = s?.history.find(h => h.week === week);
            point[`dish_${d.id}`] = entry?.count ?? 0;
        });
        return point;
    });

    const COLORS = ['#093EAA', '#F5A524', '#6FC3A5'];

    const chartConfig: ChartConfig = Object.fromEntries(
        allDishesInCompare.map(({ dish: d }, i) => [
            `dish_${d.id}`,
            { label: d.name, color: COLORS[i] },
        ])
    );

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-2xl w-full mx-auto max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-background z-10">
                    <DialogTitle>Comparer des plats</DialogTitle>
                </DialogHeader>

                <div className="p-6 flex flex-col gap-6">
                    {/* Selected dishes pills */}
                    <div className="flex flex-wrap gap-2">
                        <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-primary/30 bg-primary/10 text-primary"
                        >
                            {dish.name}
                            <span className="text-primary/50">(référence)</span>
                        </span>
                        {selected.map(d => (
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => removeDish(d.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border bg-muted hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
                            >
                                {d.name}
                                <span className="opacity-60">×</span>
                            </button>
                        ))}
                        {selected.length < 2 && (
                            <span className="text-xs text-muted-foreground self-center">
                                + sélectionnez jusqu'à {2 - selected.length} plat{2 - selected.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {/* Dish search */}
                    {selected.length < 2 && (
                        <div className="border border-border rounded-xl overflow-hidden">
                            <Command>
                                <CommandInput
                                    placeholder="Rechercher un plat à comparer…"
                                    value={search}
                                    onValueChange={setSearch}
                                />
                                <CommandList className="max-h-40">
                                    <CommandEmpty>Aucun plat trouvé</CommandEmpty>
                                    {filteredDishes.map(d => (
                                        <CommandItem key={d.id} onSelect={() => addDish(d)} className="cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                {d.image_url
                                                    ? <img src={d.image_url} alt={d.name} className="w-6 h-6 rounded object-cover" />
                                                    : <div className="w-6 h-6 rounded bg-muted flex items-center justify-center"><BookOpen className="w-3 h-3 text-muted-foreground" /></div>
                                                }
                                                <span className="text-sm">{d.name}</span>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandList>
                            </Command>
                        </div>
                    )}

                    {/* Stat comparison table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left text-xs text-muted-foreground font-medium pb-2 pr-4">Plat</th>
                                    <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-3">7 j</th>
                                    <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-3">30 j</th>
                                    <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-3">6 mois</th>
                                    <th className="text-center text-xs text-muted-foreground font-medium pb-2 px-3">1 an</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allDishesInCompare.map(({ dish: d, stats: s }, i) => (
                                    <tr key={d.id} className="border-b border-border/50 last:border-0">
                                        <td className="py-2.5 pr-4">
                                            <span className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                                                <span className="font-medium truncate max-w-[120px]">{d.name}</span>
                                            </span>
                                        </td>
                                        <td className="text-center py-2.5 px-3 font-semibold">{s?.week ?? '…'}</td>
                                        <td className="text-center py-2.5 px-3 font-semibold">{s?.month ?? '…'}</td>
                                        <td className="text-center py-2.5 px-3 font-semibold">{s?.semester ?? '…'}</td>
                                        <td className="text-center py-2.5 px-3 font-semibold">{s?.year ?? '…'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Trend chart */}
                    {chartData.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Tendance (12 semaines)</p>
                            <ChartContainer config={chartConfig} className="h-[180px] w-full">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    {allDishesInCompare.map(({ dish: d }, i) => (
                                        <Line
                                            key={d.id}
                                            type="monotone"
                                            dataKey={`dish_${d.id}`}
                                            name={d.name}
                                            stroke={COLORS[i]}
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    ))}
                                </LineChart>
                            </ChartContainer>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────
export function DishDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dishId = Number(id);

    const [dish, setDish] = useState<DishCatalogItem | null>(null);
    const [stats, setStats] = useState<DishStats | null>(null);
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [allTags, setAllTags] = useState<DietaryTag[]>([]);
    const [allCerts, setAllCerts] = useState<CertificationItem[]>([]);
    const [allDishes, setAllDishes] = useState<DishCatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [statsLoading, setStatsLoading] = useState(true);
    const [editOpen, setEditOpen] = useState(false);
    const [compareOpen, setCompareOpen] = useState(false);

    useEffect(() => {
        if (!dishId) return;
        setLoading(true);
        setStatsLoading(true);
        Promise.all([
            catalogApi.get(dishId),
            categoriesApi.list(),
            publicApi.getTaxonomy(),
            catalogApi.list({ sort: 'name' }),
        ]).then(([d, catData, taxonomy, dishList]) => {
            setDish(d);
            setCategories(catData.categories);
            setAllTags(taxonomy.dietary_tag_categories.flatMap(c => c.tags));
            setAllCerts(taxonomy.certification_categories.flatMap(c => c.certifications));
            setAllDishes(dishList);
        }).finally(() => setLoading(false));

        catalogApi.getStats(dishId)
            .then(setStats)
            .finally(() => setStatsLoading(false));
    }, [dishId]);

    const findCategory = (id: number | null): MenuCategory | undefined => {
        if (!id) return undefined;
        const flatten = (cats: MenuCategory[]): MenuCategory[] =>
            cats.flatMap(c => [c, ...flatten(c.subcategories ?? [])]);
        return flatten(categories).find(c => c.id === id);
    };

    if (loading) {
        return (
            <div className="container-mariam py-6 flex flex-col gap-6">
                <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-xl" />
                    <Skeleton className="h-6 w-48" />
                </div>
                <Skeleton className="w-full aspect-video rounded-2xl" />
                <div className="grid grid-cols-2 gap-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                </div>
                <Skeleton className="h-48 rounded-2xl" />
            </div>
        );
    }

    if (!dish) {
        return (
            <div className="container-mariam py-6 flex flex-col items-center justify-center gap-4 min-h-64">
                <BookOpen className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-muted-foreground">Plat introuvable</p>
                <Button variant="outline" onClick={() => navigate('/admin/catalogue')}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Retour au catalogue
                </Button>
            </div>
        );
    }

    const category = findCategory(dish.category_id);

    // History chart: last 26 weeks
    const historyData = (stats?.history ?? []).slice(-26).map(h => ({
        week: h.week.replace(/\d{4}-W/, 'S'),
        count: h.count,
    }));

    // Comparison bar chart: this dish + similar
    const barData = stats
        ? [
            { name: dish.name.length > 16 ? dish.name.slice(0, 14) + '…' : dish.name, count: stats.month, isCurrent: true },
            ...(stats.similar_dishes ?? []).map(s => ({
                name: s.name.length > 16 ? s.name.slice(0, 14) + '…' : s.name,
                count: s.month_count,
                isCurrent: false,
            })),
        ]
        : [];

    const trendConfig: ChartConfig = {
        count: { label: 'Passages au menu', color: '#093EAA' },
    };

    const barConfig: ChartConfig = {
        count: { label: 'Ce mois (30 j)', color: '#093EAA' },
    };

    return (
        <div className="container-mariam py-4 sm:py-6 flex flex-col gap-6 max-w-3xl">
            {/* Sticky mobile header */}
            <div className="flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-3 -mx-4 px-4 sm:static sm:bg-transparent sm:backdrop-blur-none sm:p-0 sm:mx-0 border-b border-border sm:border-0">
                <button
                    type="button"
                    onClick={() => navigate('/admin/catalogue')}
                    className="flex items-center justify-center w-9 h-9 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <p className="flex-1 font-semibold truncate text-sm sm:text-base">{dish.name}</p>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="shrink-0 gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Modifier</span>
                </Button>
            </div>

            {/* Hero */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-48 shrink-0 aspect-video sm:aspect-square rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
                    {dish.image_url
                        ? <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" />
                        : <BookOpen className="w-12 h-12 text-muted-foreground/20" />
                    }
                </div>
                <div className="flex flex-col gap-3 justify-center">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">{dish.name}</h1>
                        {category && (
                            <span className="inline-block mt-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                                {category.label}
                            </span>
                        )}
                    </div>
                    {(dish.tags.length > 0 || dish.certifications.length > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                            {dish.tags.map(t => (
                                <span
                                    key={t.id}
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted border border-border"
                                    style={{ color: t.color }}
                                    title={t.label}
                                >
                                    <Icon name={t.icon as IconName} className="w-3 h-3 shrink-0" />
                                    <span className="text-muted-foreground">{t.label}</span>
                                </span>
                            ))}
                            {dish.certifications.map(c => (
                                <span
                                    key={c.id}
                                    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700"
                                    title={c.official_name || c.name}
                                >
                                    <img
                                        src={`/certifications/${c.logo_filename}`}
                                        alt={c.name}
                                        className="h-3.5 w-3.5 object-contain"
                                    />
                                    {c.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Stat cards */}
            {statsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
                </div>
            ) : stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="7 derniers jours" value={stats.week} icon={TrendingUp} />
                    <StatCard label="30 derniers jours" value={stats.month} icon={BarChart2} />
                    <StatCard label="6 derniers mois" value={stats.semester} icon={BarChart2} />
                    <StatCard label="12 derniers mois" value={stats.year} icon={BarChart2} />
                </div>
            ) : null}

            {/* Rang catégorie */}
            {stats?.category_rank && (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                    <Scale className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-sm">
                        <span className="font-semibold text-primary">#{stats.category_rank}</span>
                        {' '}<span className="text-muted-foreground">dans sa catégorie ce mois-ci</span>
                    </p>
                </div>
            )}

            {/* Trend chart */}
            {!statsLoading && historyData.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                        Tendance (26 semaines)
                    </p>
                    <ChartContainer config={trendConfig} className="h-[180px] w-full">
                        <LineChart data={historyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="week"
                                tick={{ fontSize: 9 }}
                                interval={Math.floor(historyData.length / 6)}
                            />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#093EAA"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                            />
                        </LineChart>
                    </ChartContainer>
                </div>
            )}

            {/* Bar chart — comparaison catégorie */}
            {!statsLoading && barData.length > 1 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                        Comparaison catégorie (30 jours)
                    </p>
                    <ChartContainer config={barConfig} className="h-[160px] w-full">
                        <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar
                                dataKey="count"
                                fill="#093EAA"
                                radius={[4, 4, 0, 0]}
                                label={{ position: 'top', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            />
                        </BarChart>
                    </ChartContainer>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                        Plats similaires dans la même catégorie
                    </p>
                </div>
            )}

            {/* Compare button */}
            {stats && (
                <button
                    type="button"
                    onClick={() => setCompareOpen(true)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                    <Scale className="w-4 h-4" />
                    Comparer avec d'autres plats
                </button>
            )}

            {/* Edit drawer */}
            <EditDrawer
                open={editOpen}
                dish={dish}
                categories={categories}
                allTags={allTags}
                allCerts={allCerts}
                onClose={() => setEditOpen(false)}
                onSaved={saved => { setDish(saved); setEditOpen(false); }}
                onDeleted={() => navigate('/admin/catalogue')}
            />

            {/* Compare modal */}
            {compareOpen && stats && (
                <CompareModal
                    dish={dish}
                    stats={stats}
                    allDishes={allDishes}
                    open={compareOpen}
                    onClose={() => setCompareOpen(false)}
                />
            )}
        </div>
    );
}
