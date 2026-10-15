import { useRef, useState, useLayoutEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { DishCatalogItem } from '@/lib/api/catalog';
import type { CategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';

interface SuggestionCarouselProps {
  dishes: DishCatalogItem[];
  color: CategoryColor;
  onSelect: (dish: DishCatalogItem, sourceEl: HTMLElement) => void;
}

// Pixels per second, deliberately out of sync between rows. Speed, not
const ROW_SPEEDS_PX_S = [18, 14, 20, 16];

/** Reserved in the overflow measure too, so that the choice between static and looping holds. */
const STATIC_ROW_PADDING_PX = 16;

function rowCountFor(n: number): number {
  if (n >= 12) return 4;
  if (n >= 6) return 3;
  if (n >= 3) return 2;
  return 1;
}

function DishChip({
  dish,
  color,
  onSelect,
  ariaHidden,
}: {
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
      onClick={(e) => onSelect(dish, e.currentTarget)}
      className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card py-2 pl-2 pr-3 text-[15px] font-medium text-foreground transition-transform active:scale-[0.97]"
    >
      {dish.image_url ? (
        <img src={dish.image_url} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
      ) : (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
          style={{ backgroundColor: `${color.bg}22`, color: color.sectionLabel }}
        >
          {dish.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="whitespace-nowrap">{dish.name}</span>
    </button>
  );
}

function CarouselRow({
  dishes,
  color,
  onSelect,
  speed,
  reverse,
  animate,
}: {
  dishes: DishCatalogItem[];
  color: CategoryColor;
  onSelect: SuggestionCarouselProps['onSelect'];
  speed: number;
  reverse: boolean;
  animate: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState({ content: 0, outer: 0 });
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;
    const measure = () => setWidth({ content: content.scrollWidth, outer: outer.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(content);
    return () => observer.disconnect();
  }, [dishes]);

  // Looping, and the copy it needs, starts only when the row overflows its space,
  // margins included. The measure ignores the padding applied after it, so a row
  // cannot flip between static and looping.
  const looping = animate && width.content > width.outer - 2 * STATIC_ROW_PADDING_PX;
  // The animation travels exactly one copy of the row, so this holds the speed
  const duration = Math.max(width.content, 1) / speed;

  return (
    <div
      ref={outerRef}
      className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerCancel={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* A static row keeps its margins; a looping one runs through the edges. */}
      <div
        className={cn('flex w-max', !looping && 'px-4')}
        style={
          looping
            ? {
                animation: `mariam-marquee ${duration}s linear infinite`,
                animationDirection: reverse ? 'reverse' : 'normal',
                animationPlayState: paused ? 'paused' : 'running',
              }
            : undefined
        }
      >
        <div ref={contentRef} className={cn('flex w-max gap-2', looping && 'pr-2')}>
          {dishes.map((dish) => (
            <DishChip key={dish.id} dish={dish} color={color} onSelect={onSelect} />
          ))}
        </div>
        {looping && (
          <div className="flex w-max gap-2 pr-2" aria-hidden>
            {dishes.map((dish) => (
              <DishChip
                key={`dup-${dish.id}`}
                dish={dish}
                color={color}
                onSelect={onSelect}
                ariaHidden
              />
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

  // Round-robin: each dish appears in one row only.
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
          speed={ROW_SPEEDS_PX_S[idx % ROW_SPEEDS_PX_S.length]}
          reverse={idx % 2 === 1}
          animate={!reducedMotion}
        />
      ))}
    </div>
  );
}
