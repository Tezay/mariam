import { useEffect, useState } from 'react';
import type { SubscriptionPeriod, SubscriptionSummary } from '@/lib/api/subscriptions';
import { cn } from '@/lib/utils';
import { contractTimeline, isEndNear, longDate, type ContractTimeline } from './subscription-view';

// Hatched like a closure on the calendar: planned, not yet acquired.
const RECONDUCTION_HATCH =
  'repeating-linear-gradient(45deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.1) 3px, hsl(var(--primary) / 0.3) 3px, hsl(var(--primary) / 0.3) 6px)';

function percent(share: number): string {
  return `${Math.round(share * 1000) / 10}%`;
}

function description(geometry: ContractTimeline, current: SubscriptionPeriod): string {
  const period =
    `Période du ${longDate(current.starts_on)} au ${longDate(current.ends_on)}, ` +
    `${Math.round(geometry.elapsed * 100)} % écoulés`;
  const last = geometry.segments[geometry.segments.length - 1];
  if (last.kind === 'reconduction') {
    return `${period}, puis reconduction tacite jusqu'au ${longDate(last.ends_on)}`;
  }
  if (last.kind === 'next')
    return `${period}, puis période suivante jusqu'au ${longDate(last.ends_on)}`;
  return period;
}

export function SubscriptionTimeline({
  standing,
  today,
}: {
  standing: SubscriptionSummary & { current: SubscriptionPeriod };
  today: string;
}) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const geometry = contractTimeline(standing, today);
  if (!geometry) return null;
  const { current } = standing;
  const near = isEndNear(standing);
  const elapsed = percent(drawn ? geometry.elapsed : 0);
  const single = geometry.segments.length === 1;

  return (
    <div role="img" aria-label={description(geometry, current)} className="mt-6">
      <div className="flex h-2.5 gap-1">
        {geometry.segments.map((part) => (
          <div
            key={part.starts_on}
            className={cn(
              'relative h-full basis-0 rounded-full',
              part.kind === 'current' && 'bg-muted',
              part.kind === 'next' && 'bg-primary/25'
            )}
            style={{
              flexGrow: part.days,
              ...(part.kind === 'reconduction' && { backgroundImage: RECONDUCTION_HATCH }),
            }}
          >
            {part.kind === 'current' && (
              <>
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                    near ? 'bg-amber-500' : 'bg-primary'
                  )}
                  style={{ width: elapsed }}
                />
                {geometry.notice !== null && (
                  <span
                    className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 ring-2 ring-card"
                    style={{ left: percent(geometry.notice) }}
                  />
                )}
                <span
                  className={cn(
                    'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card shadow-sm transition-[left] duration-700 ease-out motion-reduce:transition-none',
                    near ? 'bg-amber-500' : 'bg-primary'
                  )}
                  style={{ left: elapsed }}
                />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-1 text-xs text-muted-foreground">
        {single ? (
          <>
            <span>{longDate(current.starts_on)}</span>
            <span className="ml-auto text-right">{longDate(current.ends_on)}</span>
          </>
        ) : (
          geometry.segments.map((part) => (
            <span
              key={part.starts_on}
              className={cn(
                'min-w-0 basis-0 truncate',
                part.kind === 'current' && 'font-medium text-foreground'
              )}
              style={{ flexGrow: part.days }}
            >
              {part.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
