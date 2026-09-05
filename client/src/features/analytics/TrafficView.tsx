import { useMemo } from 'react';
import { AlertTriangle, Clock, Eye, MonitorPlay, TrendingUp, Users } from 'lucide-react';
import type { TrafficSiteRow } from '@/lib/api';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { KpiCard } from './ui/KpiCard';
import { rateDelta } from './ui/delta';
import { PeriodSelector } from './ui/PeriodSelector';
import { SitePicker, type SiteOption } from './ui/SitePicker';
import { TrafficTrendChart } from './ui/charts/TrafficTrendChart';
import { HourlyProfileChart } from './ui/charts/HourlyProfileChart';
import { useAnalyticsFilters } from './hooks/useAnalyticsFilters';
import { useAnalyticsTraffic } from './hooks/useAnalyticsQueries';
import { formatNumber, formatRelative, plural, PLACEHOLDER } from './format';

interface TrafficViewProps {
  sites?: SiteOption[];
  /** Pins the view to one site, for the supervisor's drill-down. */
  siteId?: number;
  onSiteClick?: (siteId: number) => void;
}

const COLUMNS: DataTableColumn<TrafficSiteRow>[] = [
  {
    key: 'name',
    header: 'Site',
    render: (row) => <span className="font-medium">{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: 'views',
    header: 'Consultations',
    align: 'right',
    render: (row) => formatNumber(row.views),
    sortValue: (row) => row.views,
  },
  {
    key: 'unique_visitors',
    header: 'Visiteurs uniques',
    align: 'right',
    render: (row) => formatNumber(row.unique_visitors),
    sortValue: (row) => row.unique_visitors,
  },
  {
    key: 'delta_pct',
    header: 'Évolution',
    align: 'right',
    render: (row) => {
      const delta = rateDelta(row.delta_pct, formatRelative(row.delta_pct));
      return delta ? (
        <span className={delta.tone === 'positive' ? 'text-emerald-600' : 'text-red-600'}>
          {delta.text}
        </span>
      ) : (
        <span className="text-muted-foreground">{PLACEHOLDER}</span>
      );
    },
    sortValue: (row) => row.delta_pct,
  },
];

function peakHourLabel(profile: { hour: number; views: number }[]): string {
  const peak = profile.reduce((best, slot) => (slot.views > best.views ? slot : best), {
    hour: -1,
    views: 0,
  });
  if (peak.views === 0) return PLACEHOLDER;
  return `${String(peak.hour).padStart(2, '0')}h – ${String((peak.hour + 1) % 24).padStart(2, '0')}h`;
}

export function TrafficView({ sites = [], siteId, onSiteClick }: TrafficViewProps) {
  const { filters, query, setPeriod, setCustomRange, setSiteIds } = useAnalyticsFilters();
  const scopedQuery = useMemo(
    () => (siteId ? { ...query, siteIds: [siteId] } : query),
    [query, siteId]
  );
  const { data, isLoading, isError } = useAnalyticsTraffic(scopedQuery);

  const totals = data?.totals;
  const screenViews = data?.by_page_kind.find((row) => row.page_kind === 'tv')?.views ?? 0;
  const isComparative = (data?.by_site.length ?? 0) > 1;
  const hasTraffic = (totals?.views ?? 0) > 0 || screenViews > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector
          period={filters.period}
          start={filters.start}
          end={filters.end}
          onPeriodChange={setPeriod}
          onCustomRange={setCustomRange}
        />
        {!siteId && <SitePicker sites={sites} selected={filters.siteIds} onChange={setSiteIds} />}
      </div>

      {isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Consultations indisponibles"
          description="Les données n'ont pas pu être chargées. Réessayez dans un instant."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Consultations"
              icon={Eye}
              loading={isLoading}
              value={formatNumber(totals?.views)}
              hint="pages de menu ouvertes"
            />
            <KpiCard
              label="Visiteurs uniques"
              icon={Users}
              loading={isLoading}
              value={formatNumber(totals?.unique_visitors)}
              hint="estimation, sans cookie"
            />
            <KpiCard
              label="Heure de pointe"
              icon={Clock}
              loading={isLoading}
              value={data ? peakHourLabel(data.hour_profile) : PLACEHOLDER}
              hint="créneau le plus consulté"
            />
            <KpiCard
              label="Écrans TV"
              icon={MonitorPlay}
              loading={isLoading}
              value={formatNumber(screenViews)}
              hint="affichages, hors consultations"
            />
          </div>

          {!isLoading && !hasTraffic && (
            <EmptyState
              icon={TrendingUp}
              title="Pas encore de consultations"
              description="Les chiffres apparaîtront dès les premières consultations des pages publiques."
            />
          )}

          {!isLoading && data && hasTraffic && (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Consultations par jour</h2>
                <div className="rounded-xl border border-border bg-card p-4">
                  <TrafficTrendChart series={data.series} />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Consultations par heure</h2>
                  {totals && totals.org_root_views > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(totals.org_root_views)}{' '}
                      {plural(totals.org_root_views, 'arrivée')} par la page d'accueil de
                      l'organisation
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <HourlyProfileChart profile={data.hour_profile} />
                </div>
              </section>

              {isComparative && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Comparaison des sites</h2>
                  <DataTable
                    rows={data.by_site}
                    columns={COLUMNS}
                    rowKey={(row) => row.site_id}
                    defaultSortKey="views"
                    minWidthClassName="min-w-[520px]"
                    onRowClick={onSiteClick ? (row) => onSiteClick(row.site_id) : undefined}
                  />
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
