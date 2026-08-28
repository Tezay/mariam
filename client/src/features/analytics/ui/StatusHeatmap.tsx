import type { PublicationDayStatus, PublicationsReport } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDayLabel } from '../format';

const STATUS_STYLE: Record<PublicationDayStatus, { className: string; label: string }> = {
  published_on_time: { className: 'bg-emerald-500', label: 'Publié à temps' },
  published_late: { className: 'bg-amber-500', label: 'Publié en retard' },
  draft: { className: 'bg-[#9E87D1]', label: 'Brouillon' },
  missing: { className: 'bg-red-400', label: 'Non publié' },
  closed: { className: 'bg-muted border border-border', label: 'Fermé' },
};

const LEGEND_ORDER: PublicationDayStatus[] = [
  'published_on_time',
  'published_late',
  'draft',
  'missing',
  'closed',
];

interface StatusHeatmapProps {
  matrix: PublicationsReport['matrix'];
  onSiteClick?: (siteId: number) => void;
}

export function StatusHeatmap({ matrix, onSiteClick }: StatusHeatmapProps) {
  if (!matrix.length) return null;
  const days = matrix[0]?.days ?? [];
  // A single-site scope has nothing to disambiguate, so the label column only
  // costs horizontal room where it is scarcest.
  const showNames = matrix.length > 1;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div
            className={cn(
              'flex items-end gap-1 border-b border-border pb-2 pr-4 pt-4',
              !showNames && 'pl-4'
            )}
          >
            {showNames && (
              <div className="sticky left-0 z-20 w-48 shrink-0 self-stretch bg-card pl-4" />
            )}
            {days.map((day, index) => (
              <div key={day.date} className="w-5 shrink-0 text-center">
                {index % 5 === 0 && (
                  <span className="block text-[10px] leading-none text-muted-foreground">
                    {formatDayLabel(day.date)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className={cn('space-y-1 py-3 pr-4', !showNames && 'pl-4')}>
            {matrix.map((row) => (
              <div key={row.site_id} className="flex h-5 items-center gap-1">
                {showNames && (
                  <button
                    type="button"
                    disabled={!onSiteClick}
                    onClick={onSiteClick ? () => onSiteClick(row.site_id) : undefined}
                    className={cn(
                      'sticky left-0 z-20 flex h-5 w-48 shrink-0 items-center bg-card pl-4 pr-3 text-left text-xs font-medium text-foreground',
                      onSiteClick && 'transition-colors hover:text-primary'
                    )}
                    title={row.name}
                  >
                    <span className="truncate">{row.name}</span>
                  </button>
                )}
                {row.days.map((day) => {
                  const style = STATUS_STYLE[day.status];
                  return (
                    <span
                      key={day.date}
                      title={`${formatDayLabel(day.date)} — ${style.label}`}
                      className={cn('h-5 w-5 shrink-0 rounded-sm', style.className)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3">
        {LEGEND_ORDER.map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('h-3 w-3 rounded-sm', STATUS_STYLE[status].className)} />
            {STATUS_STYLE[status].label}
          </span>
        ))}
      </div>
    </div>
  );
}
