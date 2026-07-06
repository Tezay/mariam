import { Skeleton } from '@/components/ui/skeleton';

// ─── MonthViewSkeleton ────────────────────────────────────────────────────────

export function MonthViewSkeleton() {
    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-border shrink-0">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="px-3 py-2 border-r border-border last:border-r-0">
                        <Skeleton className="h-3 w-8 mx-auto" />
                    </div>
                ))}
            </div>
            {/* Week rows */}
            {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className="grid grid-cols-7 flex-1 border-b border-border last:border-b-0">
                    {Array.from({ length: 7 }).map((_, col) => (
                        <div key={col} className="border-r border-border last:border-r-0 p-2 space-y-1.5">
                            <Skeleton className="h-3.5 w-5" />
                            {row < 3 && col < 5 && (
                                <Skeleton className="h-5 w-full rounded-lg" />
                            )}
                            {row === 1 && col === 2 && (
                                <Skeleton className="h-5 w-full rounded-lg" />
                            )}
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
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Second bar placeholder */}
            <div className="h-9 border-b border-border shrink-0 bg-card" />
            {/* Columns */}
            <div className="flex flex-1 overflow-hidden border-t border-border">
                {Array.from({ length: columnCount }).map((_, col) => (
                    <div
                        key={col}
                        className="flex flex-col flex-1 border-r border-border last:border-r-0 min-w-0"
                    >
                        {/* Day header */}
                        <div className="px-3 py-2 border-b border-border space-y-1">
                            <Skeleton className="h-3 w-8" />
                            <Skeleton className="h-5 w-6" />
                        </div>
                        {/* Items */}
                        <div className="p-2 space-y-1.5">
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
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Toolbar placeholder */}
            <div className="h-12 border-b border-border shrink-0 bg-card" />
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-5 max-w-2xl mx-auto">
                    {/* Section headers + items × 2 */}
                    {Array.from({ length: 2 }).map((_, section) => (
                        <div key={section} className="space-y-3">
                            {/* Section header */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-border" />
                                <Skeleton className="h-3 w-20" />
                                <div className="flex-1 h-px bg-border" />
                            </div>
                            {/* Items */}
                            {Array.from({ length: section === 0 ? 3 : 2 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl border border-border">
                                    <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
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
