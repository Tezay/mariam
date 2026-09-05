import { cn } from '@/lib/utils';

interface SparklineProps {
  values: number[];
  className?: string;
}

/**
 * A site table renders one of these per row; Recharts would mount a resize
 * observer per cell, so the path is drawn directly.
 */
export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const step = 100 / (values.length - 1);
  const points = values.map((value, index) => `${index * step},${22 - (value / max) * 20}`);

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={cn('h-6 w-16 shrink-0', className)}
      aria-hidden
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
