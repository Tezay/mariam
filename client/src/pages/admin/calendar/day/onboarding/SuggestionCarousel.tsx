/**
 * Carrousel mobile de suggestions : 1 à 4 rangées qui défilent en boucle à
 * des vitesses (et sens) différents, façon sélection de sujets iOS.
 *
 * - Chaque plat n'apparaît que dans UNE rangée (répartition round-robin) ;
 *   la boucle infinie duplique la rangée mais ne s'active que si son contenu
 *   déborde de l'écran (sinon rangée statique, pas de doublon visible).
 * - Défilement manuel possible : l'animation se met en pause au toucher.
 * - Désactivé si prefers-reduced-motion (rangées statiques scrollables).
 */
import { useRef, useState, useLayoutEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { DishCatalogItem } from '@/lib/api';
import type { CategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';

interface SuggestionCarouselProps {
    dishes: DishCatalogItem[];
    color: CategoryColor;
    onSelect: (dish: DishCatalogItem, sourceEl: HTMLElement) => void;
}

/** Durées par rangée — vitesses volontairement désynchronisées. */
const ROW_DURATIONS_S = [30, 42, 34, 46];

/** Marge latérale (px) des rangées statiques — réservée dans la mesure de
 *  débordement pour que le choix statique/boucle soit stable. */
const STATIC_ROW_PADDING_PX = 16;

function rowCountFor(n: number): number {
    if (n >= 12) return 4;
    if (n >= 6) return 3;
    if (n >= 3) return 2;
    return 1;
}

function DishChip({ dish, color, onSelect, ariaHidden }: {
    dish: DishCatalogItem;
    color: CategoryColor;
    onSelect: SuggestionCarouselProps['onSelect'];
    ariaHidden?: boolean;
}) {
    return (
        <button
            type="button"
            aria-hidden={ariaHidden}
            tabIndex={ariaHidden ? -1 : undefined}
            onClick={e => onSelect(dish, e.currentTarget)}
            className="flex items-center gap-2 shrink-0 rounded-xl border border-border bg-card pl-2 pr-3 py-2 text-[15px] font-medium text-foreground active:scale-[0.97] transition-transform"
        >
            {dish.image_url ? (
                <img src={dish.image_url} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0" />
            ) : (
                <span
                    className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-bold"
                    style={{ backgroundColor: `${color.bg}22`, color: color.sectionLabel }}
                >
                    {dish.name.charAt(0).toUpperCase()}
                </span>
            )}
            <span className="whitespace-nowrap">{dish.name}</span>
        </button>
    );
}

function CarouselRow({ dishes, color, onSelect, duration, reverse, animate }: {
    dishes: DishCatalogItem[];
    color: CategoryColor;
    onSelect: SuggestionCarouselProps['onSelect'];
    duration: number;
    reverse: boolean;
    animate: boolean;
}) {
    const outerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = useState(false);
    const [paused, setPaused] = useState(false);

    // La boucle (et donc la duplication) ne s'active que si la rangée déborde
    // de l'espace disponible marges comprises — la mesure ne dépend pas du
    // padding appliqué ensuite, donc pas d'oscillation statique/boucle.
    useLayoutEffect(() => {
        const outer = outerRef.current;
        const content = contentRef.current;
        if (!outer || !content) return;
        const measure = () => setOverflowing(
            content.scrollWidth > outer.clientWidth - 2 * STATIC_ROW_PADDING_PX,
        );
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(outer);
        observer.observe(content);
        return () => observer.disconnect();
    }, [dishes]);

    const looping = animate && overflowing;

    return (
        <div
            ref={outerRef}
            className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerCancel={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
        >
            {/* Rangée statique : marge latérale pour ne pas coller aux bords ;
                rangée en boucle : aucune, les chips passent par le bord. */}
            <div
                className={cn('flex w-max', !looping && 'px-4')}
                style={looping ? {
                    animation: `mariam-marquee ${duration}s linear infinite`,
                    animationDirection: reverse ? 'reverse' : 'normal',
                    animationPlayState: paused ? 'paused' : 'running',
                } : undefined}
            >
                <div ref={contentRef} className={cn('flex gap-2 w-max', looping && 'pr-2')}>
                    {dishes.map(dish => (
                        <DishChip key={dish.id} dish={dish} color={color} onSelect={onSelect} />
                    ))}
                </div>
                {looping && (
                    <div className="flex gap-2 w-max pr-2" aria-hidden>
                        {dishes.map(dish => (
                            <DishChip key={`dup-${dish.id}`} dish={dish} color={color} onSelect={onSelect} ariaHidden />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function SuggestionCarousel({ dishes, color, onSelect }: SuggestionCarouselProps) {
    const reducedMotion = useReducedMotion();
    const rowCount = rowCountFor(dishes.length);

    // Répartition round-robin : chaque plat n'apparaît que dans une rangée
    const rows: DishCatalogItem[][] = Array.from({ length: rowCount }, () => []);
    dishes.forEach((dish, i) => rows[i % rowCount].push(dish));

    return (
        <div className={cn('space-y-2', rowCount >= 3 && 'space-y-2.5')}>
            <style>{`
                @keyframes mariam-marquee {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }
            `}</style>
            {rows.map((rowDishes, idx) => (
                <CarouselRow
                    key={idx}
                    dishes={rowDishes}
                    color={color}
                    onSelect={onSelect}
                    duration={ROW_DURATIONS_S[idx % ROW_DURATIONS_S.length]}
                    reverse={idx % 2 === 1}
                    animate={!reducedMotion}
                />
            ))}
        </div>
    );
}
