import { Skeleton } from '@/components/ui/skeleton';

// ─── MonthViewSkeleton ────────────────────────────────────────────────────────

export function MonthViewSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Day-of-week headers */}
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-r border-border px-3 py-2 last:border-r-0">
            <Skeleton className="mx-auto h-3 w-8" />
          </div>
        ))}
      </div>
      {/* Week rows */}
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} className="grid flex-1 grid-cols-7 border-b border-border last:border-b-0">
          {Array.from({ length: 7 }).map((_, col) => (
            <div key={col} className="space-y-1.5 border-r border-border p-2 last:border-r-0">
              <Skeleton className="h-3.5 w-5" />
              {row < 3 && col < 5 && <Skeleton className="h-5 w-full rounded-lg" />}
              {row === 1 && col === 2 && <Skeleton className="h-5 w-full rounded-lg" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── WeekViewSkeleton ─────────────────────────────────────────────────────────

export function WeekViewSkeleton({ columnCount = 5 }: { columnCount?: number }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Second bar placeholder */}
      <div className="h-9 shrink-0 border-b border-border bg-card" />
      {/* Columns */}
      <div className="flex flex-1 overflow-hidden border-t border-border">
        {Array.from({ length: columnCount }).map((_, col) => (
          <div
            key={col}
            className="flex min-w-0 flex-1 flex-col border-r border-border last:border-r-0"
          >
            {/* Day header */}
            <div className="space-y-1 border-b border-border px-3 py-2">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-5 w-6" />
            </div>
            {/* Items */}
            <div className="space-y-1.5 p-2">
              {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DayViewSkeleton ──────────────────────────────────────────────────────────

export function DayViewSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar placeholder */}
      <div className="h-12 shrink-0 border-b border-border bg-card" />
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 p-4">
          {/* Section headers + items × 2 */}
          {Array.from({ length: 2 }).map((_, section) => (
            <div key={section} className="space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <Skeleton className="h-3 w-20" />
                <div className="h-px flex-1 bg-border" />
              </div>
              {/* Items */}
              {Array.from({ length: section === 0 ? 3 : 2 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-border p-3"
                >
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
