import { Building2, ImageOff } from 'lucide-react';
import type { MenuCategory } from '@/lib/api/categories';
import { Skeleton } from '@/components/ui/skeleton';
import { getCategoryColor } from '@/lib/category-colors';
import { formatNumber } from '@/features/analytics/format';
import { cn } from '@/lib/utils';
import type { CatalogRow, CatalogScope } from '../catalog-row';
import { categoryPath } from '../categories';
import { metricsOf } from '../metrics';
import { DishMetrics } from './DishMetrics';
import { DishThumb } from './DishThumb';
import { TaxonomyBadges } from './TaxonomyBadges';

export function DishCardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <li key={index}>
          <Skeleton className="h-[96px] w-full rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

export function DishCards({
  rows,
  scope,
  onActivate,
  categories,
  selection,
}: {
  rows: CatalogRow[];
  scope: CatalogScope;
  onActivate: (row: CatalogRow, event: React.MouseEvent) => void;
  categories?: MenuCategory[];
  selection?: Set<string>;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const path = categoryPath(categories ?? [], row.categoryId);
        const color = path ? getCategoryColor(path.leaf.color_key, path.leaf.order) : null;
        const missingPhotos = (row.siteCount ?? 0) - (row.photoCount ?? 0);
        const picked = selection?.has(row.key) ?? false;
        return (
          <li key={row.key} data-dish-key={row.key}>
            <button
              type="button"
              onClick={(event) => onActivate(row, event)}
              aria-pressed={selection ? picked : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors active:scale-[0.99]',
                picked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              )}
            >
              {selection && (
                <input
                  type="checkbox"
                  checked={picked}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                />
              )}
              <DishThumb url={row.imageUrl} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium text-foreground">{row.name}</p>
                  {scope === 'org' && missingPhotos > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
                      title={`${missingPhotos} sites sans photo`}
                    >
                      <ImageOff className="h-3 w-3" aria-hidden />
                      {missingPhotos}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {path && color && (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color.bg }}
                      />
                      <span className="truncate">{path.leaf.label}</span>
                    </span>
                  )}
                  <TaxonomyBadges tags={row.tags} certifications={row.certifications} />
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <DishMetrics metrics={metricsOf(row)} />
                  {scope === 'org' && (
                    <span
                      title="Sites servant ce plat"
                      aria-label={`Sites servant ce plat : ${row.siteCount}`}
                      className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground"
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="text-foreground">{formatNumber(row.siteCount)}</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
