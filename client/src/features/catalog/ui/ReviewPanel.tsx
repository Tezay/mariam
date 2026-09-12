import { Link } from 'react-router-dom';
import { MessageSquareOff, Trophy } from 'lucide-react';
import type { DishSatisfaction } from '@/lib/api';
import { RatingDistribution } from '@/features/analytics/ui/RatingDistribution';
import { SatisfactionTrendChart } from '@/features/analytics/ui/charts/SatisfactionTrendChart';
import { formatNumber, formatScore, plural } from '@/features/analytics/format';

/** Why a dish shows no rating. The three cases call for different wording. */
type Reason = 'disabled' | 'not-votable' | 'none-yet';

function reasonFor(satisfaction: DishSatisfaction): Reason | null {
  if (!satisfaction.enabled) return 'disabled';
  if (!satisfaction.votable) return 'not-votable';
  if (satisfaction.votes === 0) return 'none-yet';
  return null;
}

function formatGap(gap: number): string {
  if (gap === 0) return 'dans la moyenne';
  const value = Math.abs(gap).toLocaleString('fr-FR', { minimumFractionDigits: 1 });
  return `${gap > 0 ? '+' : '-'}${value} par rapport à la moyenne`;
}

const MESSAGES: Record<Reason, string> = {
  disabled: 'Le vote n’est pas proposé sur ce site.',
  'not-votable': 'La catégorie de ce plat n’est pas proposée au vote.',
  'none-yet': 'Aucun avis pour le moment.',
};

export function ReviewUnavailable({
  reason,
  settingsPath,
}: {
  reason: Reason;
  settingsPath?: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <MessageSquareOff className="h-4 w-4 shrink-0" />
      {MESSAGES[reason]}
      {settingsPath && reason !== 'none-yet' && (
        <Link to={settingsPath} className="text-primary underline">
          Régler la satisfaction
        </Link>
      )}
    </p>
  );
}

export function ReviewPanel({
  satisfaction,
  settingsPath,
}: {
  satisfaction: DishSatisfaction;
  settingsPath?: string;
}) {
  const reason = reasonFor(satisfaction);
  if (reason) {
    return <ReviewUnavailable reason={reason} settingsPath={settingsPath} />;
  }

  const trend = satisfaction.series.filter((point) => point.votes > 0);
  const standing = satisfaction.standing;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-[26px] font-bold tabular-nums leading-none text-foreground">
            {formatScore(satisfaction.score)}
          </span>
          <span className="text-sm text-muted-foreground">
            {formatNumber(satisfaction.votes)} {plural(satisfaction.votes, 'réponse')}
          </span>
        </div>
        {standing && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {standing.rank}
              {standing.rank === 1 ? 'er' : 'e'} sur {standing.rated_in_category} plats notés de sa
              catégorie
            </span>
            <span aria-hidden>·</span>
            <span className="text-foreground">{formatGap(standing.gap_to_average)}</span>
          </p>
        )}
      </div>

      <RatingDistribution counts={satisfaction.distribution} presetId={satisfaction.icon_preset} />

      {trend.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Au fil des services
          </p>
          <SatisfactionTrendChart series={trend} granularity="day" />
        </div>
      )}
    </div>
  );
}
