import { RATING_LEVELS, ratingPreset } from '@/features/rating/scale';
import { RatingIcons } from '@/features/rating/RatingIcons';
import { formatNumber, formatPercent } from '../format';

/** Horizontal breakdown of the three levels, rendered from the shared scale. */
export function RatingDistribution({
  counts,
  presetId,
}: {
  counts: Record<'1' | '2' | '3', number>;
  presetId?: string;
}) {
  const total = counts['1'] + counts['2'] + counts['3'];
  const preset = ratingPreset(presetId);

  return (
    <div className="space-y-2">
      {[...RATING_LEVELS].reverse().map((level) => {
        const count = counts[String(level.value) as '1' | '2' | '3'];
        const share = total ? count / total : 0;
        return (
          <div key={level.value} className="flex items-center gap-3">
            <span className="w-12 shrink-0" style={{ color: level.color }}>
              <RatingIcons preset={preset} value={level.value} className="h-4 w-4" />
            </span>
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{level.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${share * 100}%`, backgroundColor: level.color }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {formatPercent(share)} · {formatNumber(count)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
