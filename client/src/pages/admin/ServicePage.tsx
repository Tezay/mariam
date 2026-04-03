/**
 * MARIAM - Page Service en cours
 *
 * Vue opérationnelle dédiée au service :
 * - Aperçu du menu du jour avec gestion des ruptures (Switch par item)
 * - Note du chef éditable avec sauvegarde automatique au blur
 * - Édition rapide inline par item (nom, tags, label de remplacement)
 * - Accès au MenuEditor complet si besoin
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    menusApi, categoriesApi, publicApi,
    Menu, MenuItem, MenuCategory, DietaryTag, ServiceHours,
} from '@/lib/api';
import { isInServiceHours } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MenuEditor } from '@/components/MenuEditor';
import { Icon } from '@/components/ui/icon-picker';
import type { IconName } from '@/components/ui/icon-picker';
import {
    ChefHat, Clock, Pencil, ChevronRight, AlertTriangle, CalendarDays,
} from 'lucide-react';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function formatTodayLabel(date: Date): string {
    return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function nextServiceSlot(serviceHours: ServiceHours): string | null {
    const now = new Date();
    const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const curMin = now.getHours() * 60 + now.getMinutes();

    for (let offset = 0; offset < 7; offset++) {
        const dayIdx = (todayIdx + offset) % 7;
        const slot = serviceHours[String(dayIdx)];
        if (!slot) continue;
        const [oh, om] = slot.open.split(':').map(Number);
        const openMin = oh * 60 + om;
        if (offset > 0 || curMin < openMin) {
            const dayLabel = offset === 0 ? 'aujourd\'hui' : offset === 1 ? 'demain' : DAY_NAMES[(dayIdx + 1) % 7].toLowerCase();
            return `Prochain service : ${dayLabel} à ${slot.open}`;
        }
    }
    return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Dialogue d'édition rapide d'un item
// ────────────────────────────────────────────────────────────────────────────

interface ItemEditDialogProps {
    item: MenuItem;
    availableTags: DietaryTag[];
    onClose: () => void;
    onSave: (patch: Pick<MenuItem, 'name' | 'replacement_label' | 'tags'>) => Promise<void>;
}

function ItemEditDialog({ item, availableTags, onClose, onSave }: ItemEditDialogProps) {
    const [name, setName] = useState(item.name);
    const [replacement, setReplacement] = useState(item.replacement_label ?? '');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
        (item.tags ?? []).map(t => t.id)
    );
    const [saving, setSaving] = useState(false);

    const toggleTag = (id: string) => {
        setSelectedTagIds(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const patchedTags = availableTags.filter(t => selectedTagIds.includes(t.id));
            await onSave({
                name: name.trim(),
                replacement_label: replacement.trim() || null,
                tags: patchedTags,
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Modifier le plat</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <Label htmlFor="item-name">Nom du plat</Label>
                        <Input
                            id="item-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div>
                        <Label htmlFor="item-replacement">Label de remplacement</Label>
                        <Input
                            id="item-replacement"
                            value={replacement}
                            onChange={e => setReplacement(e.target.value)}
                            placeholder="Affiché si rupture (ex: Poulet rôti)"
                        />
                    </div>

                    {availableTags.length > 0 && (
                        <div>
                            <Label className="mb-2 block">Tags</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {availableTags.map(tag => {
                                    const active = selectedTagIds.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => toggleTag(tag.id)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                                                active
                                                    ? 'border-transparent bg-primary text-primary-foreground'
                                                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                                            }`}
                                        >
                                            <Icon name={tag.icon as IconName} className="w-3 h-3" />
                                            {tag.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Annuler
                    </Button>
                    <Button onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Ligne d'item
// ────────────────────────────────────────────────────────────────────────────

interface ItemRowProps {
    item: MenuItem;
    isToggling: boolean;
    onToggle: () => void;
    onEdit: () => void;
}

function ItemRow({ item, isToggling, onToggle, onEdit }: ItemRowProps) {
    const isOut = !!item.is_out_of_stock;

    return (
        <div className={`flex items-start gap-3 px-3 py-3.5 min-h-[56px] rounded-lg border transition-colors ${
            isOut
                ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/30'
                : 'bg-muted/30 border-transparent'
        }`}>
            <Switch
                checked={!isOut}
                onCheckedChange={onToggle}
                disabled={isToggling}
                className={isOut ? 'data-[state=unchecked]:bg-amber-400' : ''}
                aria-label={isOut ? 'Remettre en stock' : 'Signaler rupture'}
            />

            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${isOut ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.name}
                </p>
                {(item.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {(item.tags ?? []).map(tag => (
                            <Badge
                                key={tag.id}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 gap-1 font-normal"
                            >
                                <Icon name={tag.icon as IconName} className="w-2.5 h-2.5" />
                                {tag.label}
                            </Badge>
                        ))}
                    </div>
                )}
                {isOut && item.replacement_label && (
                    <div className="flex items-center gap-1 mt-1">
                        <ChevronRight className="w-3 h-3 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{item.replacement_label}</p>
                    </div>
                )}
                {isOut && !item.replacement_label && (
                    <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-0.5">Aucun remplacement défini</p>
                )}
            </div>

            <button
                type="button"
                onClick={onEdit}
                className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Modifier ce plat"
                aria-label="Modifier ce plat"
            >
                <Pencil className="w-4 h-4" />
            </button>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Page principale
// ────────────────────────────────────────────────────────────────────────────

export function ServicePage() {
    const navigate = useNavigate();
    const today = new Date().toISOString().split('T')[0];

    const [menu, setMenu] = useState<Menu | null>(null);
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [availableTags, setAvailableTags] = useState<DietaryTag[]>([]);
    const [serviceHours, setServiceHours] = useState<ServiceHours>({});
    const [loading, setLoading] = useState(true);

    const [togglingId, setTogglingId] = useState<number | null>(null);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [chefNote, setChefNote] = useState('');
    const [chefNoteSaving, setChefNoteSaving] = useState(false);
    const [showMenuEditor, setShowMenuEditor] = useState(false);

    const duringService = isInServiceHours(serviceHours);
    const outOfStockCount = (menu?.items ?? []).filter(i => i.is_out_of_stock).length;
    const totalCount = (menu?.items ?? []).length;

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [menuRes, catRes, restaurantRes] = await Promise.all([
                menusApi.getByDate(today).catch(() => null),
                categoriesApi.list().catch(() => ({ categories: [] })),
                publicApi.getRestaurant().catch(() => null),
            ]);

            const loadedMenu: Menu | null = menuRes?.menu ?? menuRes ?? null;
            setMenu(loadedMenu);
            setChefNote(loadedMenu?.chef_note ?? '');
            setCategories(catRes.categories ?? []);

            const hours = restaurantRes?.config?.service_hours ?? {};
            setServiceHours(hours);

            const tags: DietaryTag[] = restaurantRes?.config?.dietary_tags ?? [];
            setAvailableTags(tags);
        } finally {
            setLoading(false);
        }
    }, [today]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Rupture ─────────────────────────────────────────────────────────────

    const handleToggleStock = async (item: MenuItem) => {
        if (!menu?.id || !item.id || togglingId === item.id) return;
        setTogglingId(item.id);
        try {
            const updated = await menusApi.updateItemStock(menu.id, item.id, !item.is_out_of_stock);
            setMenu(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === item.id ? { ...i, ...updated } : i),
            } : prev);
        } catch {
        } finally {
            setTogglingId(null);
        }
    };

    // ── Note du chef ────────────────────────────────────────────────────────

    const handleChefNoteBlur = async () => {
        if (!menu?.id || chefNote === (menu.chef_note ?? '')) return;
        setChefNoteSaving(true);
        try {
            await menusApi.updateChefNote(menu.id, chefNote || null);
            setMenu(prev => prev ? { ...prev, chef_note: chefNote || undefined } : prev);
        } finally {
            setChefNoteSaving(false);
        }
    };

    // ── Édition rapide inline ────────────────────────────────────────────────

    const handleItemSave = async (patch: Pick<MenuItem, 'name' | 'replacement_label' | 'tags'>) => {
        if (!menu || !editingItem) return;
        const updatedItems = menu.items.map(i =>
            i.id === editingItem.id ? { ...i, ...patch } : i
        );
        await menusApi.save(today, updatedItems, menu.restaurant_id);
        await loadData();
    };

    // ── Rendu catégories ────────────────────────────────────────────────────

    const renderLeafItems = (category: MenuCategory) => {
        const items = (menu?.items ?? [])
            .filter(i => i.category_id === category.id)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        if (items.length === 0) return null;

        return (
            <div key={category.id} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <Icon name={category.icon as IconName} className="w-3.5 h-3.5" />
                    {category.label}
                </div>
                {items.map(item => (
                    <ItemRow
                        key={item.id}
                        item={item}
                        isToggling={togglingId === item.id}
                        onToggle={() => handleToggleStock(item)}
                        onEdit={() => setEditingItem(item)}
                    />
                ))}
            </div>
        );
    };

    const renderCategory = (cat: MenuCategory) => {
        const hasSubs = (cat.subcategories?.length ?? 0) > 0;

        if (hasSubs) {
            const subContent = cat.subcategories!
                .sort((a, b) => a.order - b.order)
                .map(sub => renderLeafItems(sub))
                .filter(Boolean);
            if (subContent.length === 0) return null;
            return (
                <div key={cat.id} className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Icon name={cat.icon as IconName} className="w-5 h-5 text-muted-foreground" />
                        <h3 className="font-medium text-foreground">{cat.label}</h3>
                    </div>
                    <div className="pl-4 border-l-2 border-border space-y-4">{subContent}</div>
                </div>
            );
        }

        return renderLeafItems(cat);
    };

    // ── Render ───────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="container-mariam py-8 flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="container-mariam py-6 max-w-2xl">

            {/* En-tête */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground mb-1">Service en cours</h1>
                    <p className="text-muted-foreground">{formatTodayLabel(new Date())}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        duringService
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${duringService ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
                        {duringService ? 'En service' : 'Hors service'}
                    </span>
                    {menu && totalCount > 0 && outOfStockCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            {outOfStockCount} rupture{outOfStockCount > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>

            {/* Bannière hors service */}
            {!duringService && (
                <div className="mb-6 flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/40">
                    <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-foreground">Hors service</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {nextServiceSlot(serviceHours) ?? 'Aucun créneau de service configuré.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Aucun menu publié */}
            {!menu || menu.status !== 'published' ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                    <CalendarDays className="w-10 h-10 text-muted-foreground/40" />
                    <div>
                        <p className="font-medium text-foreground">Aucun menu publié aujourd'hui</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Publiez le menu du jour depuis le planificateur hebdomadaire.
                        </p>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/admin/menus')}>
                        Aller au planificateur
                    </Button>
                </div>
            ) : (
                <div className="space-y-6">

                    {/* Note du chef */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="chef-note" className="flex items-center gap-1.5 text-sm font-medium">
                                <ChefHat className="w-4 h-4 text-muted-foreground" />
                                Note du chef
                            </Label>
                            {chefNoteSaving && (
                                <span className="text-xs text-muted-foreground">Enregistrement…</span>
                            )}
                        </div>
                        <Textarea
                            id="chef-note"
                            rows={2}
                            value={chefNote}
                            onChange={e => setChefNote(e.target.value)}
                            onBlur={handleChefNoteBlur}
                            placeholder="Message affiché sur l'écran public…"
                            maxLength={300}
                            className="resize-none bg-muted/40"
                        />
                        <p className="text-xs text-muted-foreground text-right">{chefNote.length}/300</p>
                    </div>

                    {/* Items par catégorie */}
                    <div className="space-y-6">
                        {[...categories]
                            .sort((a, b) => a.order - b.order)
                            .map(cat => renderCategory(cat))
                            .filter(Boolean)
                        }
                    </div>

                    {/* Bouton éditeur complet */}
                    <div className="pt-2 border-t border-border">
                        <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => setShowMenuEditor(true)}
                        >
                            <Pencil className="w-4 h-4" />
                            Ouvrir l'éditeur complet
                        </Button>
                    </div>
                </div>
            )}

            {/* Dialog édition rapide */}
            {editingItem && (
                <ItemEditDialog
                    item={editingItem}
                    availableTags={availableTags}
                    onClose={() => setEditingItem(null)}
                    onSave={handleItemSave}
                />
            )}

            {/* MenuEditor complet */}
            {showMenuEditor && menu && (
                <MenuEditor
                    date={today}
                    restaurantId={menu.restaurant_id}
                    menu={menu}
                    onClose={() => setShowMenuEditor(false)}
                    onSave={loadData}
                />
            )}
        </div>
    );
}
