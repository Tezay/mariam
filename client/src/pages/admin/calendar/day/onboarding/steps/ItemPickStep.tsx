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
    const categoryItems = editor.items.filter(it => it.category_id === currentGroup?.catId);

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
        [availableDishes],
    );

    // Plats de la catégorie déjà au menu (pour détecter une re-saisie)
    const menuDishesOfCategory = useMemo(
        () => categoryItems.filter(it => it.dish).map(it => it.dish!),
        [categoryItems],
    );
    const menuFuse = useMemo(
        () => new Fuse(menuDishesOfCategory, { keys: ['name'], threshold: 0.4, includeScore: true }),
        [menuDishesOfCategory],
    );

    const isSearching = query.trim().length > 0;
    const filteredDishes = useMemo(() => {
        if (!isSearching) return availableDishes;
        return fuse.search(query.trim()).map(r => r.item);
    }, [isSearching, query, fuse, availableDishes]);

    const handleSubmit = () => {
        const q = query.trim();
        if (!q) return;
        // Déjà au menu ? (exact normalisé ou fuzzy proche)
        const inMenuFuzzy = menuFuse.search(q)[0];
        if (state.findInMenuByName(q) || (inMenuFuzzy && (inMenuFuzzy.score ?? 1) < FUZZY_MATCH_THRESHOLD)) {
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
        <div className="flex flex-col flex-1 min-h-0">
            <div className="shrink-0 px-4 pt-4 pb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: color.sectionLabel }}>
                    {currentGroup?.parentLabel ? `${currentGroup.parentLabel} · ` : ''}{currentGroup?.category.label}
                </p>
                <h2 className="text-lg font-semibold text-foreground mt-0.5">
                    {categoryItems.length === 0 ? 'Quel plat au menu ?' : 'Un autre plat ?'}
                </h2>

                {/* Plats déjà ajoutés à cette catégorie */}
                {categoryItems.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {categoryItems.map(item => (
                            <span
                                key={item.id}
                                className="rounded-lg px-2 py-1 text-xs font-semibold"
                                style={{ backgroundColor: color.bg, color: color.label, borderBottom: `2px solid ${color.border}` }}
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
                        }}
                        placeholder={availableDishes.length > 0 ? 'Rechercher ou nouveau plat…' : 'Nom du plat…'}
                        enterKeyHint="done"
                        className={cn(
                            'w-full h-12 sm:h-11 rounded-xl border border-input bg-background pl-9 text-sm outline-none transition-shadow focus:ring-2 focus:ring-primary/40',
                            isSearching ? 'pr-24' : 'pr-3',
                        )}
                    />
                    {isSearching && (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.97] transition-all animate-in fade-in duration-150"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Créer
                        </button>
                    )}
                </div>
                <div className="h-5 pt-1">
                    {alreadyInMenu && (
                        <p className="text-xs text-orange-500 animate-in fade-in duration-200">
                            « {alreadyInMenu} » est déjà au menu
                        </p>
                    )}
                </div>
            </div>

            {/* Suggestions */}
            <div className={cn('flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2', keyboardOpen && 'max-h-32')}>
                {filteredDishes.length > 0 ? (
                    <>
                        {/* Mobile au repos : carrousel auto-défilant */}
                        {!isSearching && !keyboardOpen && (
                            <div className="sidebar:hidden py-1">
                                <SuggestionCarousel dishes={filteredDishes} color={color} onSelect={handleSelect} />
                            </div>
                        )}
                        {/* Mobile en recherche / clavier ouvert : liste statique */}
                        {(isSearching || keyboardOpen) && (
                            <div className="sidebar:hidden px-4">
                                <SuggestionList dishes={filteredDishes} color={color} onSelect={handleSelect} />
                            </div>
                        )}
                        {/* Desktop : liste en wrap, pas de défilement automatique */}
                        <div className="hidden sidebar:block px-4">
                            <SuggestionList dishes={filteredDishes} color={color} onSelect={handleSelect} />
                        </div>
                    </>
                ) : isSearching ? (
                    <p className="text-sm text-muted-foreground py-2 px-4">
                        Aucun plat correspondant — créez « {query.trim()} » avec le bouton ci-dessus.
                    </p>
                ) : (
                    <div className="py-4 px-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            Aucun plat connu en {currentGroup?.category.label.toLowerCase()}.<br />
                            Le premier que vous saisissez rejoindra votre catalogue.
                        </p>
                    </div>
                )}
            </div>

            {/* Actions */}
            {!(keyboardOpen && isSearching) && (
                <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-background pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                    <div className="flex-1" />
                    {categoryItems.length === 0 ? (
                        <Button variant="ghost" onClick={state.skipCategory} className="gap-1.5 rounded-xl text-muted-foreground h-12 sm:h-10">
                            <SkipForward className="w-4 h-4" />
                            Passer cette catégorie
                        </Button>
                    ) : (
                        <Button onClick={state.finishCategory} className="gap-1.5 rounded-xl h-12 sm:h-10">
                            Catégorie suivante
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
