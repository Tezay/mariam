/**
 * MARIAM — Page « Service en cours »
 *
 * Vue opérationnelle du jour : suivi des ruptures (Switch par item),
 * note du chef (autosave), statut de service et actions rapides.
 * Layout 2 colonnes sur desktop (menu + rail récapitulatif), empilé sur mobile.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  menusApi,
  categoriesApi,
  restaurantApi,
  Menu,
  MenuItem,
  MenuCategory,
  ServiceHours,
} from '@/lib/api';
import { isInServiceHours } from '@/lib/utils';
import { parisToday } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import {
  ChefHat,
  Clock,
  Pencil,
  AlertTriangle,
  CalendarDays,
  Maximize2,
  Minimize2,
  ExternalLink,
  PackageX,
} from 'lucide-react';

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

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
      const dayLabel =
        offset === 0
          ? "aujourd'hui"
          : offset === 1
            ? 'demain'
            : DAY_NAMES[(dayIdx + 1) % 7].toLowerCase();
      return `Prochain service : ${dayLabel} à ${slot.open}`;
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Ligne d'item — Switch de rupture
// ────────────────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: MenuItem;
  isToggling: boolean;
  onToggle: () => void;
}

function ItemRow({ item, isToggling, onToggle }: ItemRowProps) {
  const isOut = !!item.is_out_of_stock;
  const dishName = item.dish?.name ?? '';
  const tags = item.dish?.tags ?? [];

  return (
    <div
      className={`flex min-h-[52px] items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
        isOut
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-950/20'
          : 'border-border bg-card'
      }`}
    >
      <Switch
        checked={!isOut}
        onCheckedChange={onToggle}
        disabled={isToggling}
        className={isOut ? 'mt-0.5 data-[state=unchecked]:bg-amber-400' : 'mt-0.5'}
        aria-label={isOut ? 'Remettre en stock' : 'Signaler rupture'}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium leading-snug ${isOut ? 'text-muted-foreground line-through' : 'text-foreground'}`}
        >
          {dishName || <span className="italic text-muted-foreground">Plat sans nom</span>}
        </p>
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="gap-1 px-1.5 py-0 text-[10px] font-normal"
              >
                <Icon name={tag.icon as IconName} className="h-2.5 w-2.5" />
                {tag.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {isOut && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
          <PackageX className="h-3 w-3" />
          Épuisé
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Rail récapitulatif
// ────────────────────────────────────────────────────────────────────────────

interface SummaryCardProps {
  lastUpdated: Date | null;
  duringService: boolean;
  serviceHours: ServiceHours;
  outOfStockCount: number;
  totalCount: number;
  hasMenu: boolean;
}

function SummaryCard({
  lastUpdated,
  duringService,
  serviceHours,
  outOfStockCount,
  totalCount,
  hasMenu,
}: SummaryCardProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{formatTodayLabel(new Date())}</p>
        {lastUpdated && (
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Mis à jour à{' '}
            {lastUpdated.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            duringService
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${duringService ? 'animate-pulse bg-green-500' : 'bg-muted-foreground/50'}`}
          />
          {duringService ? 'En service' : 'Hors service'}
        </span>
        {hasMenu && totalCount > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              outOfStockCount > 0
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            {outOfStockCount} / {totalCount} rupture{outOfStockCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!duringService && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {nextServiceSlot(serviceHours) ?? 'Aucun créneau de service configuré.'}
          </p>
        </div>
      )}
    </div>
  );
}

interface ChefNoteCardProps {
  value: string;
  saving: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function ChefNoteCard({ value, saving, onChange, onBlur }: ChefNoteCardProps) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ChefHat className="h-4 w-4 text-muted-foreground" />
          Note du chef
        </span>
        {saving && <span className="text-xs text-muted-foreground">Enregistrement…</span>}
      </div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="Message affiché sur l'écran public…"
        maxLength={300}
        className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary"
      />
      <p className="text-right text-[10px] text-muted-foreground">{value.length}/300</p>
    </div>
  );
}

interface ActionsCardProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenEditor: () => void;
}

function ActionsCard({ isFullscreen, onToggleFullscreen, onOpenEditor }: ActionsCardProps) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-2">
      <Button
        variant="ghost"
        className="h-9 w-full justify-start gap-2.5"
        onClick={() => window.open('/menu', '_blank')}
      >
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
        Aperçu écran public
      </Button>
      <Button
        variant="ghost"
        className="h-9 w-full justify-start gap-2.5"
        onClick={onToggleFullscreen}
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Maximize2 className="h-4 w-4 text-muted-foreground" />
        )}
        {isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      </Button>
      <Button variant="ghost" className="h-9 w-full justify-start gap-2.5" onClick={onOpenEditor}>
        <Pencil className="h-4 w-4 text-muted-foreground" />
        Ouvrir l'éditeur complet
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page principale
// ────────────────────────────────────────────────────────────────────────────

export function ServicePage() {
  const navigate = useNavigate();
  const today = parisToday();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [serviceHours, setServiceHours] = useState<ServiceHours>({});
  const [loading, setLoading] = useState(true);

  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [chefNote, setChefNote] = useState('');
  const [chefNoteSaving, setChefNoteSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const duringService = isInServiceHours(serviceHours);
  const outOfStockCount = (menu?.items ?? []).filter((i) => i.is_out_of_stock).length;
  const totalCount = (menu?.items ?? []).length;
  const published = !!menu && menu.status === 'published';

  const loadMenu = useCallback(async () => {
    try {
      const menuRes = await menusApi.getByDate(today).catch(() => null);
      setMenu(menuRes ?? null);
      setChefNote((prev) => menuRes?.chef_note ?? prev);
      setLastUpdated(new Date());
    } catch {
      /* ignore polling errors */
    }
  }, [today]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes, catRes, restaurantRes] = await Promise.all([
        menusApi.getByDate(today).catch(() => null),
        categoriesApi.list().catch(() => ({ categories: [] })),
        restaurantApi.getMine().catch(() => null),
      ]);
      setMenu(menuRes ?? null);
      setChefNote(menuRes?.chef_note ?? '');
      setCategories(catRes.categories ?? []);
      setServiceHours(restaurantRes?.config?.service_hours ?? {});
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const id = setInterval(loadMenu, 60_000);
    return () => clearInterval(id);
  }, [loadMenu]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  };

  const handleToggleStock = async (item: MenuItem) => {
    if (!menu?.id || !item.id || togglingId === item.id) return;
    setTogglingId(item.id);
    try {
      const updated = await menusApi.updateItemStock(menu.id, item.id, !item.is_out_of_stock);
      setMenu((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) => (i.id === item.id ? { ...i, ...updated } : i)),
            }
          : prev
      );
    } catch {
      /* ignore */
    } finally {
      setTogglingId(null);
    }
  };

  const handleChefNoteBlur = async () => {
    if (!menu?.id || chefNote === (menu.chef_note ?? '')) return;
    setChefNoteSaving(true);
    try {
      await menusApi.updateChefNote(menu.id, chefNote || null);
      setMenu((prev) => (prev ? { ...prev, chef_note: chefNote || undefined } : prev));
    } finally {
      setChefNoteSaving(false);
    }
  };

  // ── Rendu des catégories (colonne principale) ────────────────────────────
  const renderLeafItems = (category: MenuCategory) => {
    const items = (menu?.items ?? [])
      .filter((i) => i.category_id === category.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (items.length === 0) return null;

    return (
      <div key={category.id} className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {category.label}
        </p>
        <div className="space-y-1.5">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              isToggling={togglingId === item.id}
              onToggle={() => handleToggleStock(item)}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderCategory = (cat: MenuCategory) => {
    const hasSubs = (cat.subcategories?.length ?? 0) > 0;
    if (hasSubs) {
      const subContent = cat
        .subcategories!.sort((a, b) => a.order - b.order)
        .map((sub) => renderLeafItems(sub))
        .filter(Boolean);
      if (subContent.length === 0) return null;
      return (
        <div key={cat.id} className="space-y-4">
          <h3 className="font-semibold text-foreground">{cat.label}</h3>
          <div className="space-y-4 border-l-2 border-border pl-4">{subContent}</div>
        </div>
      );
    }
    return renderLeafItems(cat);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="order-2 space-y-6 lg:order-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                {Array.from({ length: i === 0 ? 3 : 2 }).map((_, j) => (
                  <Skeleton key={j} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </div>
          <div className="order-1 space-y-4 lg:order-2">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* Colonne principale — menu */}
        <div className="order-2 min-w-0 lg:order-1">
          {!published ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-foreground">Aucun menu publié aujourd'hui</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publiez le menu du jour depuis le calendrier.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate(`/admin/calendar?date=${today}`)}>
                Aller au calendrier
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {[...categories]
                .sort((a, b) => a.order - b.order)
                .map((cat) => renderCategory(cat))
                .filter(Boolean)}
            </div>
          )}
        </div>

        {/* Rail récapitulatif */}
        <aside className="order-1 space-y-4 self-start lg:sticky lg:top-6 lg:order-2">
          <SummaryCard
            lastUpdated={lastUpdated}
            duringService={duringService}
            serviceHours={serviceHours}
            outOfStockCount={outOfStockCount}
            totalCount={totalCount}
            hasMenu={published}
          />
          {published && (
            <ChefNoteCard
              value={chefNote}
              saving={chefNoteSaving}
              onChange={setChefNote}
              onBlur={handleChefNoteBlur}
            />
          )}
          <ActionsCard
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onOpenEditor={() => navigate(`/admin/calendar?date=${today}`)}
          />
        </aside>
      </div>
    </div>
  );
}
