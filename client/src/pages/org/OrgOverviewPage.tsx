import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  Clock,
  SmilePlus,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react';
import type { AnalyticsOverviewSite, OrgSite } from '@/lib/api';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PageHeader } from './ui';
import { AddSiteButton } from './AddSiteButton';
import { KpiCard } from '@/features/analytics/ui/KpiCard';
import { rateDelta } from '@/features/analytics/ui/delta';
import { PeriodSelector } from '@/features/analytics/ui/PeriodSelector';
import { SitePicker } from '@/features/analytics/ui/SitePicker';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { RateBar } from '@/features/analytics/ui/RateBar';
import { useAnalyticsFilters } from '@/features/analytics/hooks/useAnalyticsFilters';
import { useAnalyticsOverview, useOrgSites } from '@/features/analytics/hooks/useAnalyticsQueries';
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPoints,
} from '@/features/analytics/format';
import { cn } from '@/lib/utils';

interface OverviewRow extends AnalyticsOverviewSite {
  todayPublished: boolean;
  userCount: number;
}

function TodayMenuBadge({ published }: { published: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        className={cn('h-1.5 w-1.5 rounded-full', published ? 'bg-emerald-500' : 'bg-red-400')}
      />
      <span className={published ? 'text-foreground' : 'text-red-600 dark:text-red-400'}>
        {published ? 'Publié' : 'Non publié'}
      </span>
    </span>
  );
}

const COLUMNS: DataTableColumn<OverviewRow>[] = [
  {
    key: 'name',
    header: 'Site',
    render: (row) => <span className="font-medium">{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: 'today',
    header: 'Menu du jour',
    render: (row) => <TodayMenuBadge published={row.todayPublished} />,
    sortValue: (row) => (row.todayPublished ? 1 : 0),
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
    key: 'last_published_at',
    header: 'Dernière publication',
    align: 'right',
    render: (row) => (
      <span className="text-muted-foreground">{formatDateTime(row.last_published_at)}</span>
    ),
    sortValue: (row) => row.last_published_at,
  },
  {
    key: 'users',
    header: 'Comptes',
    align: 'right',
    render: (row) => formatNumber(row.userCount),
    sortValue: (row) => row.userCount,
  },
];

export function OrgOverviewPage() {
  const navigate = useNavigate();
  const { filters, query, setPeriod, setCustomRange, setSiteIds } = useAnalyticsFilters();
  const { data: overview, isLoading } = useAnalyticsOverview(query);
  const { data: orgSites } = useOrgSites();

  const sitesById = useMemo(() => {
    const map = new Map<number, OrgSite>();
    (orgSites ?? []).forEach((site) => map.set(site.id, site));
    return map;
  }, [orgSites]);

  const rows = useMemo<OverviewRow[]>(
    () =>
      (overview?.sites ?? []).map((site) => {
        const orgSite = sitesById.get(site.site_id);
        return {
          ...site,
          todayPublished: orgSite?.today_menu_published ?? false,
          userCount: orgSite?.user_count ?? 0,
        };
      }),
    [overview, sitesById]
  );

  const siteOptions = useMemo(
    () => (orgSites ?? []).map((site) => ({ id: site.id, name: site.name })),
    [orgSites]
  );

  const kpis = overview?.kpis;
  const publishedToday = rows.filter((row) => row.todayPublished).length;
  const missingToday = rows.filter((row) => !row.todayPublished && row.is_active);
  const isComparative = rows.length > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vue d'ensemble"
        description="L'activité de tous vos sites en un coup d'œil."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelector
              period={filters.period}
              start={filters.start}
              end={filters.end}
              onPeriodChange={setPeriod}
              onCustomRange={setCustomRange}
            />
            <SitePicker sites={siteOptions} selected={filters.siteIds} onChange={setSiteIds} />
          </div>
        }
      />

      {missingToday.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="font-medium text-foreground">
            {missingToday.length === 1
              ? '1 site n’a pas publié son menu du jour'
              : `${missingToday.length} sites n’ont pas publié leur menu du jour`}
          </span>
          <span className="text-muted-foreground">
            {missingToday
              .slice(0, 3)
              .map((row) => row.name)
              .join(', ')}
            {missingToday.length > 3 && ` +${missingToday.length - 3}`}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard
          label="Menus du jour"
          icon={UtensilsCrossed}
          loading={isLoading}
          value={`${publishedToday}/${rows.length}`}
          hint="publiés aujourd'hui"
        />
        <KpiCard
          label="Taux de publication"
          icon={CalendarCheck}
          loading={isLoading}
          value={formatPercent(kpis?.publication_rate.value)}
          delta={rateDelta(
            kpis?.publication_rate.delta,
            formatPoints(kpis?.publication_rate.delta)
          )}
          hint="des jours d'ouverture"
        />
        <KpiCard
          label="Ponctualité"
          icon={Clock}
          loading={isLoading}
          value={formatPercent(kpis?.punctuality_rate.value)}
          delta={rateDelta(
            kpis?.punctuality_rate.delta,
            formatPoints(kpis?.punctuality_rate.delta)
          )}
          hint="publiés avant le service"
        />
        <KpiCard
          label="Sites actifs"
          icon={Building2}
          loading={isLoading}
          value={`${kpis?.sites.active ?? 0}/${kpis?.sites.total ?? 0}`}
          hint="sites de l'organisation"
        />
        <KpiCard
          label="Fréquentation"
          icon={TrendingUp}
          pending="Bientôt disponible — la mesure démarre à la prochaine mise à jour."
          value={null}
        />
        <KpiCard
          label="Satisfaction"
          icon={SmilePlus}
          pending="Bientôt disponible — les retours étudiants arrivent prochainement."
          value={null}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {isComparative ? 'Vos sites' : 'Votre site'}
          </h2>
          <Link
            to="/org/analytics/publications"
            className="text-xs font-medium text-primary hover:underline"
          >
            Détail des publications
          </Link>
        </div>
        <DataTable
          rows={rows}
          columns={COLUMNS}
          rowKey={(row) => row.site_id}
          defaultSortKey="publication_rate"
          loading={isLoading}
          onRowClick={(row) => navigate(`/org/sites/${row.site_id}`)}
          emptyState={
            <EmptyState
              icon={Building2}
              title="Aucun site"
              description="Aucun site n'est encore rattaché à votre organisation."
              action={<AddSiteButton />}
            />
          }
        />
      </section>
    </div>
  );
}
