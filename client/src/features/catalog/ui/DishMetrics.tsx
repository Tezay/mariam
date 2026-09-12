import { cn } from '@/lib/utils';
import type { DishMetric } from '../metrics';

export function DishMetrics({ metrics, className }: { metrics: DishMetric[]; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {metrics.map((metric) => (
        <span
          key={metric.label}
          title={metric.label}
          aria-label={`${metric.label} : ${metric.value}`}
          className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground"
        >
          <metric.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="text-foreground">{metric.value}</span>
        </span>
      ))}
    </div>
  );
}
