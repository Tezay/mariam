import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { DeltaTone, KpiDelta } from './delta';

const TONE_CLASS: Record<DeltaTone, string> = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
};

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: KpiDelta | null;
  icon?: ComponentType<{ className?: string }>;
  loading?: boolean;
  /** Replaces the value when the metric is not collected yet. */
  pending?: string;
}

export function KpiCard({ label, value, hint, delta, icon: Icon, loading, pending }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : pending ? (
        <p className="mt-3 text-sm text-muted-foreground">{pending}</p>
      ) : (
        <div className="mt-2 text-[26px] font-bold tabular-nums leading-tight tracking-tight text-foreground">
          {value}
        </div>
      )}

      {!loading && !pending && (delta || hint) && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          {delta && <span className={cn('font-medium', TONE_CLASS[delta.tone])}>{delta.text}</span>}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
