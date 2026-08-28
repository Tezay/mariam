import { Progress } from '@/components/ui/progress';
import { formatPercent, PLACEHOLDER } from '../format';

interface RateBarProps {
  value: number | null;
}

export function RateBar({ value }: RateBarProps) {
  if (value === null) {
    return <span className="text-muted-foreground">{PLACEHOLDER}</span>;
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <Progress value={value * 100} className="h-1.5 w-16" />
      <span className="w-10 text-right tabular-nums">{formatPercent(value)}</span>
    </div>
  );
}
