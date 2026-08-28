import { AlertTriangle, CalendarCheck, Clock, ImageIcon, Timer } from 'lucide-react';
import type { PublicationSiteRow } from '@/lib/api';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { KpiCard } from './ui/KpiCard';
import { PeriodSelector } from './ui/PeriodSelector';
import { SitePicker, type SiteOption } from './ui/SitePicker';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { StatusHeatmap } from './ui/StatusHeatmap';
import { RateBar } from './ui/RateBar';
import { useAnalyticsFilters } from './hooks/useAnalyticsFilters';
import { useAnalyticsPublications } from './hooks/useAnalyticsQueries';
import { formatDuration, formatLeadTime, formatPercent, isLate, leadTimeLabel } from './format';
import { cn } from '@/lib/utils';

interface PublicationsViewProps {
  sites?: SiteOption[];
  onSiteClick?: (siteId: number) => void;
}

const COLUMNS: DataTableColumn<PublicationSiteRow>[] = [
  {
    key: 'name',
    header: 'Site',
    render: (row) => <span className="font-medium">{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: 'publication_rate',
    header: 'Publication',
    align: 'right',
    render: (row) => <RateBar value={row.publication_rate} />,
    sortValue: (row) => row.publication_rate,
  },
  {
    key: 'punctuality_rate',
    header: 'Ponctualité',
    align: 'right',
    render: (row) => <RateBar value={row.punctuality_rate} />,
    sortValue: (row) => row.punctuality_rate,
  },
  {
    key: 'avg_lead_time_hours',
    header: 'Anticipation',
    align: 'right',
    render: (row) => (
      <span className={cn(isLate(row.avg_lead_time_hours) && 'text-amber-600')}>
        {formatLeadTime(row.avg_lead_time_hours)}
      </span>
    ),
    sortValue: (row) => row.avg_lead_time_hours,
  },
  {
    key: 'photo_rate',
    header: 'Photos',
    align: 'right',
    render: (row) => <RateBar value={row.photo_rate} />,
    sortValue: (row) => row.photo_rate,
  },
  {
    key: 'chef_note_rate',
    header: 'Note du chef',
    align: 'right',
    render: (row) => <RateBar value={row.chef_note_rate} />,
    sortValue: (row) => row.chef_note_rate,
  },
];

export function PublicationsView({ sites = [], onSiteClick }: PublicationsViewProps) {
  const { filters, query, setPeriod, setCustomRange, setSiteIds } = useAnalyticsFilters();
  const { data, isLoading, isError } = useAnalyticsPublications(query);

  const summary = data?.summary;
  const isComparative = (data?.sites.length ?? 0) > 1;

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
        <SitePicker sites={sites} selected={filters.siteIds} onChange={setSiteIds} />
      </div>

      {isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Statistiques indisponibles"
          description="Les données n'ont pas pu être chargées. Réessayez dans un instant."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Taux de publication"
              icon={CalendarCheck}
              loading={isLoading}
              value={formatPercent(summary?.publication_rate)}
              hint="des jours d'ouverture"
            />
            <KpiCard
              label="Ponctualité"
              icon={Clock}
              loading={isLoading}
              value={formatPercent(summary?.punctuality_rate)}
              hint="publiés avant le service"
            />
            <KpiCard
              label="Anticipation"
              icon={Timer}
              loading={isLoading}
              value={formatDuration(summary?.avg_lead_time_hours)}
              hint={
                <span className={cn(isLate(summary?.avg_lead_time_hours) && 'text-amber-600')}>
                  {leadTimeLabel(summary?.avg_lead_time_hours) || "avant l'ouverture"}
                </span>
              }
            />
            <KpiCard
              label="Photos"
              icon={ImageIcon}
              loading={isLoading}
              value={formatPercent(summary?.completeness.photo_rate)}
              hint="des plats illustrés"
            />
          </div>

          {!isLoading && data && data.matrix.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Calendrier de publication</h2>
              <StatusHeatmap matrix={data.matrix} onSiteClick={onSiteClick} />
            </section>
          )}

          {isComparative && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Comparaison des sites</h2>
              <DataTable
                rows={data?.sites ?? []}
                columns={COLUMNS}
                rowKey={(row) => row.site_id}
                defaultSortKey="publication_rate"
                loading={isLoading}
                onRowClick={onSiteClick ? (row) => onSiteClick(row.site_id) : undefined}
              />
            </section>
          )}

          {!isLoading && data && data.sites.length === 0 && (
            <EmptyState
              icon={CalendarCheck}
              title="Aucun site à analyser"
              description="Créez un site pour suivre la publication de ses menus."
            />
          )}
        </>
      )}
    </div>
  );
}
