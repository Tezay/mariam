/**
 * Étape de saisie d'un plat : plats déjà ajoutés à la catégorie visibles,
 * input avec bouton de création inline, suggestions de la catégorie courante
 * (dédupliquées, hors plats déjà au menu).
 *
 * Mobile : carrousel auto-défilant multi-rangées au repos, liste statique
 * dès qu'on tape ou que le clavier est ouvert (autofocus desktop seulement).
 * Desktop : liste en wrap, pas de défilement automatique.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import Fuse from 'fuse.js';
import { Search, ChevronRight, SkipForward, Plus } from 'lucide-react';
import type { DishCatalogItem } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UseOnboardingStateReturn } from '../useOnboardingState';
import { SuggestionList } from '../SuggestionList';
import { SuggestionCarousel } from '../SuggestionCarousel';

const FUZZY_MATCH_THRESHOLD = 0.15;
// Aligné sur le breakpoint Tailwind custom `sidebar`
const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

interface ItemPickStepProps {
  state: UseOnboardingStateReturn;
  keyboardOpen: boolean;
  onSelectWithFly: (dish: DishCatalogItem, sourceEl: HTMLElement | null) => void;
}

export function ItemPickStep({ state, keyboardOpen, onSelectWithFly }: ItemPickStepProps) {
  const { currentGroup, availableDishes, editor } = state;
  const [query, setQuery] = useState('');
  const [alreadyInMenu, setAlreadyInMenu] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const groupIdx = state.step.kind === 'category' ? state.step.groupIdx : 0;
  const color = getCategoryColor(currentGroup?.category.color_key, groupIdx);
  const categoryItems = editor.items.filter((it) => it.category_id === currentGroup?.catId);

  // Autofocus desktop uniquement — sur mobile, laisser le carrousel visible
  // sans ouvrir le clavier d'emblée
  useEffect(() => {
    if (!window.matchMedia(DESKTOP_MEDIA_QUERY).matches) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Feedback « déjà au menu » éphémère
  useEffect(() => {
    if (!alreadyInMenu) return;
    const t = setTimeout(() => setAlreadyInMenu(null), 2500);
    return () => clearTimeout(t);
  }, [alreadyInMenu]);

  const fuse = useMemo(
    () => new Fuse(availableDishes, { keys: ['name'], threshold: 0.4, includeScore: true }),
    [availableDishes]
  );

  // Plats de la catégorie déjà au menu (pour détecter une re-saisie)
  const menuDishesOfCategory = useMemo(
    () => categoryItems.filter((it) => it.dish).map((it) => it.dish!),
    [categoryItems]
  );
  const menuFuse = useMemo(
    () => new Fuse(menuDishesOfCategory, { keys: ['name'], threshold: 0.4, includeScore: true }),
    [menuDishesOfCategory]
  );

  const isSearching = query.trim().length > 0;
  const filteredDishes = useMemo(() => {
    if (!isSearching) return availableDishes;
    return fuse.search(query.trim()).map((r) => r.item);
  }, [isSearching, query, fuse, availableDishes]);

  const handleSubmit = () => {
    const q = query.trim();
    if (!q) return;
    // Déjà au menu ? (exact normalisé ou fuzzy proche)
    const inMenuFuzzy = menuFuse.search(q)[0];
    if (
      state.findInMenuByName(q) ||
      (inMenuFuzzy && (inMenuFuzzy.score ?? 1) < FUZZY_MATCH_THRESHOLD)
    ) {
      setAlreadyInMenu(q);
      return;
    }
    // Correspondance forte avec un plat du catalogue → on le sélectionne
    const best = fuse.search(q)[0];
    if (best && (best.score ?? 1) < FUZZY_MATCH_THRESHOLD) {
      setQuery('');
      onSelectWithFly(best.item, inputRef.current);
      return;
    }
    setQuery('');
    state.startNewDish(q);
  };

  const handleSelect = (dish: DishCatalogItem, el: HTMLElement) => {
    setQuery('');
    onSelectWithFly(dish, el);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-4">
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: color.sectionLabel }}
        >
          {currentGroup?.parentLabel ? `${currentGroup.parentLabel} · ` : ''}
          {currentGroup?.category.label}
        </p>
        <h2 className="mt-0.5 text-lg font-semibold text-foreground">
          {categoryItems.length === 0 ? 'Quel plat au menu ?' : 'Un autre plat ?'}
        </h2>

        {/* Plats déjà ajoutés à cette catégorie */}
        {categoryItems.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categoryItems.map((item) => (
              <span
                key={item.id}
                className="rounded-lg px-2 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: color.bg,
                  color: color.label,
                  borderBottom: `2px solid ${color.border}`,
                }}
              >
                {item.dish?.name ?? '…'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Input au-dessus des suggestions, bouton de création inline */}
      <div className="shrink-0 px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              availableDishes.length > 0 ? 'Rechercher ou nouveau plat…' : 'Nom du plat…'
            }
            enterKeyHint="done"
            className={cn(
              'h-12 w-full rounded-xl border border-input bg-background pl-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/40 sm:h-11',
              isSearching ? 'pr-24' : 'pr-3'
            )}
          />
          {isSearching && (
            <button
              type="button"
              onClick={handleSubmit}
              className="absolute right-1.5 top-1/2 flex h-9 -translate-y-1/2 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-all duration-150 animate-in fade-in hover:bg-primary/90 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              Créer
            </button>
          )}
        </div>
        <div className="h-5 pt-1">
          {alreadyInMenu && (
            <p className="text-xs text-orange-500 duration-200 animate-in fade-in">
              « {alreadyInMenu} » est déjà au menu
            </p>
          )}
        </div>
      </div>

      {/* Suggestions */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2',
          keyboardOpen && 'max-h-32'
        )}
      >
        {filteredDishes.length > 0 ? (
          <>
            {/* Mobile au repos : carrousel auto-défilant */}
            {!isSearching && !keyboardOpen && (
              <div className="py-1 sidebar:hidden">
                <SuggestionCarousel dishes={filteredDishes} color={color} onSelect={handleSelect} />
              </div>
            )}
            {/* Mobile en recherche / clavier ouvert : liste statique */}
            {(isSearching || keyboardOpen) && (
              <div className="px-4 sidebar:hidden">
                <SuggestionList dishes={filteredDishes} color={color} onSelect={handleSelect} />
              </div>
            )}
            {/* Desktop : liste en wrap, pas de défilement automatique */}
            <div className="hidden px-4 sidebar:block">
              <SuggestionList dishes={filteredDishes} color={color} onSelect={handleSelect} />
            </div>
          </>
        ) : isSearching ? (
          <p className="px-4 py-2 text-sm text-muted-foreground">
            Aucun plat correspondant — créez « {query.trim()} » avec le bouton ci-dessus.
          </p>
        ) : (
          <div className="px-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun plat connu en {currentGroup?.category.label.toLowerCase()}.<br />
              Le premier que vous saisissez rejoindra votre catalogue.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      {!(keyboardOpen && isSearching) && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="flex-1" />
          {categoryItems.length === 0 ? (
            <Button
              variant="ghost"
              onClick={state.skipCategory}
              className="h-12 gap-1.5 rounded-xl text-muted-foreground sm:h-10"
            >
              <SkipForward className="h-4 w-4" />
              Passer cette catégorie
            </Button>
          ) : (
            <Button onClick={state.finishCategory} className="h-12 gap-1.5 rounded-xl sm:h-10">
              Catégorie suivante
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
