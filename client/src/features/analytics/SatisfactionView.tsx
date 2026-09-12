import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, MessageSquareHeart, SmilePlus, Users, Utensils } from 'lucide-react';
import type { SatisfactionDishRow, SatisfactionSiteRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { RATING_LEVELS, nearestLevel, ratingPreset } from '@/features/rating/scale';
import { RatingIcons } from '@/features/rating/RatingIcons';
import { KpiCard } from './ui/KpiCard';
import { rateDelta } from './ui/delta';
import { PeriodSelector } from './ui/PeriodSelector';
import { SitePicker, type SiteOption } from './ui/SitePicker';
import { RatingDistribution } from './ui/RatingDistribution';
import { SatisfactionTrendChart } from './ui/charts/SatisfactionTrendChart';
import { useAnalyticsFilters } from './hooks/useAnalyticsFilters';
import { useAnalyticsSatisfaction } from './hooks/useAnalyticsQueries';
import { formatNumber, formatPercent, formatScore, formatScoreDelta, plural } from './format';

/** Below this a score swings on a handful of answers; the table says so. */
const THIN_EVIDENCE = 20;

interface SatisfactionViewProps {
  sites?: SiteOption[];
  /** Pins the view to one site, for the supervisor's drill-down. */
  siteId?: number;
  onSiteClick?: (siteId: number) => void;
  onDishClick?: (dish: SatisfactionDishRow) => void;
}

const COLUMNS: DataTableColumn<SatisfactionSiteRow>[] = [
  {
    key: 'name',
    header: 'Site',
    render: (row) => <span className="font-medium">{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: 'score',
    header: 'Score',
    align: 'right',
    render: (row) => formatScore(row.score),
    sortValue: (row) => row.score,
  },
  {
    key: 'votes',
    header: 'Réponses',
    align: 'right',
    render: (row) =>
      row.score !== null && row.votes < THIN_EVIDENCE ? (
        <span className="inline-flex items-center gap-1.5">
          {formatNumber(row.votes)}
          <span className="text-xs text-muted-foreground" title="Peu d'avis : score indicatif">
            peu d’avis
          </span>
        </span>
      ) : (
        formatNumber(row.votes)
      ),
    sortValue: (row) => row.votes,
  },
  {
    key: 'participation_rate',
    header: 'Participation',
    align: 'right',
    render: (row) => formatPercent(row.participation_rate),
    sortValue: (row) => row.participation_rate,
  },
];

function DishList({
  rows,
  empty,
  onDishClick,
}: {
  rows: SatisfactionDishRow[];
  empty: string;
  onDishClick?: (dish: SatisfactionDishRow) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const body = (
          <>
            <span className="min-w-0 truncate text-foreground">{row.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatScore(row.score)} · {formatNumber(row.votes)} {plural(row.votes, 'réponse')}
            </span>
          </>
        );
        return (
          <li key={`${row.dish_id}`}>
            {onDishClick ? (
              <button
                type="button"
                onClick={() => onDishClick(row)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60"
              >
                {body}
              </button>
            ) : (
              <div className="flex items-baseline justify-between gap-3 py-1 text-sm">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SatisfactionView({
  sites = [],
  siteId,
  onSiteClick,
  onDishClick,
}: SatisfactionViewProps) {
  const { filters, query, setPeriod, setCustomRange, setSiteIds } = useAnalyticsFilters();
  const scopedQuery = useMemo(
    () => (siteId ? { ...query, siteIds: [siteId] } : query),
    [query, siteId]
  );
  const { data, isLoading, isError } = useAnalyticsSatisfaction(scopedQuery);

  const summary = data?.summary;
  const settings = data?.settings;
  const level = nearestLevel(summary?.score);
  const isComparative = (data?.by_site.length ?? 0) > 1;
  const hasVotes = (summary?.votes ?? 0) > 0;
  const voteOff =
    settings !== undefined && settings.site_count > 0 && settings.sites_with_vote === 0;
  const silentSites = settings ? settings.site_count - settings.sites_with_vote : 0;
  // A single site reached without a drill-down is the admin's own: only there
  // does a link to the settings lead somewhere the reader can act.
  const ownSite = settings?.site_count === 1 && siteId === undefined;
  const dishEmpty =
    settings?.dish_question === false
      ? "La question du plat n'est pas posée : aucune catégorie n'est cochée dans les réglages."
      : 'Pas encore assez de réponses par plat.';

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
          title="Satisfaction indisponible"
          description="Les données n'ont pas pu être chargées. Réessayez dans un instant."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Score moyen"
              icon={SmilePlus}
              loading={isLoading}
              value={formatScore(summary?.score)}
              delta={rateDelta(summary?.delta, formatScoreDelta(summary?.delta))}
              hint={level ? `proche de « ${level.label} »` : 'de 1 à 3'}
            />
            <KpiCard
              label="Réponses"
              icon={MessageSquareHeart}
              loading={isLoading}
              value={formatNumber(summary?.votes)}
              hint="votes des étudiants"
            />
            <KpiCard
              label="Participation"
              icon={Users}
              loading={isLoading}
              value={formatPercent(summary?.participation_rate)}
              hint={
                silentSites > 0 && (settings?.site_count ?? 0) > 1
                  ? `${silentSites} ${plural(silentSites, 'site')} sur ${settings?.site_count} ne ${silentSites > 1 ? 'proposent' : 'propose'} pas le vote`
                  : 'des visiteurs qui répondent'
              }
            />
            <KpiCard
              label="Sites couverts"
              icon={Utensils}
              loading={isLoading}
              value={formatNumber(data?.by_site.filter((row) => row.votes > 0).length)}
              hint="ayant reçu au moins un vote"
            />
          </div>

          {!isLoading && voteOff && (
            <EmptyState
              icon={SmilePlus}
              title="Le vote n'est pas proposé"
              description={
                ownSite
                  ? "Une question à un tap s'affiche en fin de menu du jour, dès que le service commence. Les réponses sont anonymes et ne sont visibles que dans vos statistiques. Activez « Proposer le vote » dans l'onglet Satisfaction des réglages."
                  : 'Aucun site de ce périmètre ne propose le vote à ses visiteurs.'
              }
              action={
                ownSite ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/admin/settings">Ouvrir les réglages</Link>
                  </Button>
                ) : undefined
              }
            />
          )}

          {!isLoading && !voteOff && !hasVotes && (
            <EmptyState
              icon={SmilePlus}
              title="Pas encore de réponse"
              description="Les scores apparaîtront dès les premiers votes sur les pages publiques."
            />
          )}

          {!isLoading && data && hasVotes && (
            <>
              <section className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Répartition des réponses
                  </h2>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <RatingDistribution
                      counts={data.summary.distribution}
                      presetId={data.settings.icon_preset ?? data.by_preset[0]?.preset}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {data.granularity === 'hour'
                      ? 'Score au fil des heures'
                      : 'Score au fil des jours'}
                  </h2>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <SatisfactionTrendChart series={data.series} granularity={data.granularity} />
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Plats les mieux notés</h2>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <DishList rows={data.top_dishes} empty={dishEmpty} onDishClick={onDishClick} />
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Plats les moins bien notés
                  </h2>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <DishList rows={data.flop_dishes} empty={dishEmpty} onDishClick={onDishClick} />
                  </div>
                </div>
              </section>

              {data.by_preset.length > 1 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Comparaison des présentations
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {data.by_preset.map((row) => {
                      const preset = ratingPreset(row.preset);
                      return (
                        <div
                          key={row.preset}
                          className="rounded-xl border border-border bg-card p-4"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {preset.label}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-muted-foreground">
                            {RATING_LEVELS.map((item) => (
                              <RatingIcons
                                key={item.value}
                                preset={preset}
                                value={item.value}
                                className="h-4 w-4"
                              />
                            ))}
                          </div>
                          <p className="mt-2 text-[22px] font-bold tabular-nums leading-tight text-foreground">
                            {formatScore(row.score)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatNumber(row.votes)} {plural(row.votes, 'réponse')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {isComparative && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-foreground">Comparaison des sites</h2>
                  <DataTable
                    rows={data.by_site}
                    columns={COLUMNS}
                    rowKey={(row) => row.site_id}
                    defaultSortKey="score"
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
