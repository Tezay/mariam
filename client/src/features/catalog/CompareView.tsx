import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Scale } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { catalogApi, type CatalogPeriod, type DishStats } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { formatDayLabel, formatNumber, formatScore } from '@/features/analytics/format';
import { RatingDistribution } from '@/features/analytics/ui/RatingDistribution';
import { DishThumb } from './ui/DishThumb';

const SERIES_COLORS = ['#093EAA', '#F5A524', '#6FC3A5'];
const SPARSE_SERIES = 10;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function CompareView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const period = (params.get('period') as CatalogPeriod | null) ?? 'all';
  const ids = useMemo(
    () =>
      (params.get('ids') ?? '')
        .split(',')
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)
        .slice(0, SERIES_COLORS.length),
    [params]
  );

  const { data: dishes, isPending: dishesPending } = useQuery({
    queryKey: ['catalogue', 'compare-dishes', ids],
    queryFn: () => Promise.all(ids.map((id) => catalogApi.get(id))),
    enabled: ids.length > 0,
  });

  const { data: stats } = useQuery({
    queryKey: ['catalogue', 'compare-stats', ids, period],
    queryFn: () => catalogApi.getStatsBatch(ids, period),
    enabled: ids.length > 0,
  });

  const chart = useMemo(() => {
    const config: ChartConfig = {};
    const byDate = new Map<string, Record<string, string | number>>();
    (dishes ?? []).forEach((dish, index) => {
      config[`dish_${dish.id}`] = { label: dish.name, color: SERIES_COLORS[index] };
      for (const point of stats?.[String(dish.id)]?.satisfaction.series ?? []) {
        const row = byDate.get(point.date) ?? { date: point.date };
        row[`dish_${dish.id}`] = point.score;
        byDate.set(point.date, row);
      }
    });
    const data = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { config, data };
  }, [dishes, stats]);

  if (ids.length < 2) {
    return (
      <div className="container-mariam py-6">
        <EmptyState
          icon={Scale}
          title="Rien à comparer"
          description="Sélectionnez au moins deux plats depuis le catalogue."
          action={
            <Button variant="outline" onClick={() => navigate('/admin/catalogue')}>
              Retour au catalogue
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-mariam space-y-6 py-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 text-muted-foreground"
          onClick={() => navigate('/admin/catalogue')}
        >
          <ArrowLeft className="h-4 w-4" /> Catalogue
        </Button>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Comparaison</h1>
      </div>

      {dishesPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ids.map((id) => (
            <Skeleton key={id} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(dishes ?? []).map((dish, index) => {
            const entry: DishStats | undefined = stats?.[String(dish.id)];
            return (
              <section
                key={dish.id}
                className="space-y-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: SERIES_COLORS[index] }}
                  />
                  <DishThumb url={dish.image_url} className="h-10 w-10" />
                  <p className="min-w-0 flex-1 truncate font-medium text-foreground">{dish.name}</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <Figure label="Note" value={formatScore(entry?.satisfaction.score ?? null)} />
                  <Figure label="Avis" value={formatNumber(entry?.satisfaction.votes ?? 0)} />
                  <Figure label="Servis sur 1 an" value={formatNumber(entry?.year ?? 0)} />
                </div>

                {entry && entry.satisfaction.votes > 0 && (
                  <RatingDistribution
                    counts={entry.satisfaction.distribution}
                    presetId={entry.satisfaction.icon_preset}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      {chart.data.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Note au fil des services</h2>
          <div className="rounded-xl border border-border bg-card p-4">
            <ChartContainer config={chart.config} className="h-[220px] w-full">
              <LineChart data={chart.data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayLabel}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  domain={[1, 3]}
                  ticks={[1, 2, 3]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelClassName="mb-1.5 border-b border-border pb-1.5"
                      labelFormatter={(label) => formatDayLabel(String(label))}
                    />
                  }
                />
                {(dishes ?? []).map((dish) => (
                  <Line
                    key={dish.id}
                    type="monotone"
                    dataKey={`dish_${dish.id}`}
                    stroke={`var(--color-dish_${dish.id})`}
                    strokeWidth={2}
                    dot={chart.data.length <= SPARSE_SERIES ? { r: 3 } : false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </div>
        </section>
      )}
    </div>
  );
}
