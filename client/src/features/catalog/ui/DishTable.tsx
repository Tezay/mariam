import {
  ArrowDown,
  ArrowUp,
  Building2,
  Image as ImageIcon,
  MessageSquare,
  Star,
  UtensilsCrossed,
} from 'lucide-react';
import type { MenuCategory } from '@/lib/api/categories';
import { Skeleton } from '@/components/ui/skeleton';
import { getCategoryColor } from '@/lib/category-colors';
import { formatNumber, formatScore } from '@/features/analytics/format';
import { cn } from '@/lib/utils';
import type { CatalogRow, CatalogScope } from '../catalog-row';
import { categoryPath, pathLabel } from '../categories';
import { DishThumb } from './DishThumb';
import { TaxonomyBadges } from './TaxonomyBadges';

interface Column {
  key: string;
  label: string;
  /** Figures are headed by their icon alone; the label stays for screen readers. */
  icon?: typeof Star;
  /** Absent when the column carries no server-side ordering. */
  sort?: string;
  /** Text columns read left, figures right. */
  align?: 'left';
  render: (row: CatalogRow) => React.ReactNode;
}

export function DishTable({
  rows,
  scope,
  loading,
  sort,
  ascending,
  onSort,
  onActivate,
  categories,
  selection,
}: {
  rows: CatalogRow[];
  scope: CatalogScope;
  loading?: boolean;
  sort: string;
  ascending: boolean;
  onSort: (sort: string) => void;
  onActivate: (row: CatalogRow, event: React.MouseEvent) => void;
  categories?: MenuCategory[];
  selection?: Set<string>;
}) {
  const columns: Column[] = [
    {
      key: 'name',
      label: 'Plat',
      sort: 'name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <DishThumb url={row.imageUrl} className="h-8 w-8" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <TaxonomyBadges tags={row.tags} certifications={row.certifications} />
          </div>
        </div>
      ),
    },
    ...(scope === 'site'
      ? [
          {
            key: 'category',
            label: 'Catégorie',
            align: 'left' as const,
            render: (row: CatalogRow) => {
              const path = categoryPath(categories ?? [], row.categoryId);
              if (!path) return <span className="text-muted-foreground">—</span>;
              const color = getCategoryColor(path.leaf.color_key, path.leaf.order);
              return (
                <span className="flex items-center gap-1.5" title={pathLabel(path)}>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color.bg }}
                  />
                  {path.parent && (
                    <span className="truncate text-muted-foreground">{path.parent.label} ›</span>
                  )}
                  <span className="truncate text-foreground">{path.leaf.label}</span>
                </span>
              );
            },
          },
        ]
      : []),
    ...(scope === 'org'
      ? [
          {
            key: 'sites',
            label: 'Sites servant ce plat',
            icon: Building2,
            sort: 'sites',
            render: (row: CatalogRow) => formatNumber(row.siteCount),
          },
        ]
      : []),
    {
      key: 'usage',
      label: 'Passages au menu',
      icon: UtensilsCrossed,
      sort: 'usage',
      render: (row) => formatNumber(row.usageCount),
    },
    ...(scope === 'org'
      ? [
          {
            key: 'photos',
            label: 'Sites avec photo',
            icon: ImageIcon,
            sort: 'photos',
            render: (row: CatalogRow) => (
              <span className={row.photoCount === 0 ? 'text-muted-foreground' : undefined}>
                {row.photoCount}/{row.siteCount}
              </span>
            ),
          },
        ]
      : [
          {
            key: 'votes',
            label: 'Avis reçus',
            icon: MessageSquare,
            render: (row: CatalogRow) => formatNumber(row.votes),
          },
        ]),
    {
      key: 'score',
      label: 'Note moyenne sur 3',
      icon: Star,
      sort: 'score',
      render: (row) => formatScore(row.score),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {selection && <th className="w-10 px-3" />}
            {columns.map((column, index) => {
              const left = column.align === 'left' || index === 0;
              const HeadIcon = column.icon;
              const head = HeadIcon ? (
                <>
                  <HeadIcon className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{column.label}</span>
                </>
              ) : (
                column.label
              );
              return (
                <th
                  key={column.key}
                  title={column.icon ? column.label : undefined}
                  className={cn(
                    'px-4 py-2.5 text-xs font-medium text-muted-foreground',
                    left ? 'text-left' : 'text-right'
                  )}
                >
                  {column.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.sort as string)}
                      aria-label={`Trier par ${column.label.toLowerCase()}`}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        sort === column.sort && 'text-foreground'
                      )}
                    >
                      {head}
                      {sort === column.sort &&
                        (ascending ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1">{head}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-dish-key={row.key}
              onClick={(event) => onActivate(row, event)}
              className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40"
            >
              {selection && (
                <td className="px-3">
                  <input
                    type="checkbox"
                    checked={selection.has(row.key)}
                    onChange={() => {}}
                    aria-label={`Sélectionner ${row.name}`}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                </td>
              )}
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-2.5',
                    column.align === 'left' || index === 0 ? 'text-left' : 'text-right tabular-nums'
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
