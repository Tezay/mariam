import { useQuery } from '@tanstack/react-query';
import { orgApi } from '@/lib/api/org';
import { type SatisfactionDishRow } from '@/lib/api/analytics';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatScore, plural } from '@/features/analytics/format';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {children}
      </div>
    </section>
  );
}

function Row({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0 truncate text-foreground">{name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{detail}</span>
    </div>
  );
}

/**
 * Two panels for the supervisor's overview. The rated one is dropped from the
 * DOM when no site collects votes, so the grid closes to a single column
 * instead of leaving a hole.
 */
export function DishHighlights({ topDishes }: { topDishes: SatisfactionDishRow[] }) {
  const { data, isPending } = useQuery({
    queryKey: ['org', 'catalog', 'most-served'],
    queryFn: () => orgApi.getCatalog({ sort: 'usage', page: 1, per_page: 5 }),
  });

  const served = data?.dishes ?? [];
  const rated = topDishes.slice(0, 5);

  if (isPending) {
    return <Skeleton className="h-44 rounded-xl" />;
  }
  if (served.length === 0 && rated.length === 0) {
    return null;
  }

  return (
    <div className={rated.length > 0 ? 'grid gap-4 lg:grid-cols-2' : ''}>
      {served.length > 0 && (
        <Panel title="Les plus servis">
          {served.map((dish) => (
            <Row
              key={dish.normalized_name}
              name={dish.display_name}
              detail={`${formatNumber(dish.usage_count)} services · ${dish.site_count} ${plural(dish.site_count, 'site')}`}
            />
          ))}
        </Panel>
      )}

      {rated.length > 0 && (
        <Panel title="Les mieux notés">
          {rated.map((dish) => (
            <Row
              key={`${dish.dish_id}`}
              name={dish.name}
              detail={`${formatScore(dish.score)} · ${formatNumber(dish.votes)} avis`}
            />
          ))}
        </Panel>
      )}
    </div>
  );
}
