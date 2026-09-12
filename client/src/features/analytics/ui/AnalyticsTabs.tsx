import { CalendarCheck, Eye, SmilePlus } from 'lucide-react';
import { useAnalyticsOverview } from '../hooks/useAnalyticsQueries';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';
import { formatNumber, formatPercent, formatScore } from '../format';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export type AnalyticsTab = 'traffic' | 'satisfaction' | 'publications';

const TABS = [
  { id: 'traffic' as const, label: 'Consultations menu', icon: Eye },
  { id: 'satisfaction' as const, label: 'Satisfaction', icon: SmilePlus },
  { id: 'publications' as const, label: 'Publications', icon: CalendarCheck },
];

/**
 * The three analytics views, each tab carrying its headline figure so the ones
 * you are not reading still say whether they are worth opening. The figures
 * come from the overview endpoint the dashboard already calls.
 */
export function AnalyticsTabs({
  value,
  onChange,
}: {
  value: AnalyticsTab;
  onChange: (tab: AnalyticsTab) => void;
}) {
  const { query } = useAnalyticsFilters();
  const { data, isPending } = useAnalyticsOverview(query);

  const kpis = data?.kpis;
  const figures: Record<AnalyticsTab, string> = {
    traffic: formatNumber(kpis?.views?.value),
    satisfaction: formatScore(kpis?.satisfaction?.value),
    publications: formatPercent(kpis?.publication_rate.value),
  };

  return (
    // One segmented block rather than three cards: separate cards read as data,
    // which is exactly what sits below them.
    <div
      role="tablist"
      aria-label="Vues statistiques"
      className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted p-1 sm:grid sm:grid-cols-3 sm:overflow-visible"
    >
      {TABS.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex min-w-[9.5rem] flex-1 flex-col gap-1 rounded-lg px-4 py-2.5 text-left transition-colors',
              active ? 'bg-card shadow-sm' : 'text-muted-foreground hover:bg-card/60'
            )}
          >
            <span
              className={cn(
                'flex items-center gap-2 text-[13px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" aria-hidden />
              {tab.label}
            </span>
            {isPending ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <span
                className={cn(
                  'text-[22px] font-bold tabular-nums leading-tight',
                  active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {figures[tab.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
