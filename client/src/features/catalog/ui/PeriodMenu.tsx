import { CalendarRange, Check } from 'lucide-react';
import type { CatalogPeriod } from '@/lib/api/catalog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PERIOD_LABELS, PERIOD_ORDER, PERIOD_SHORT } from '../hooks/useCatalogFilters';
import { CONTROL, CONTROL_ICON } from './control';

export function PeriodMenu({
  value,
  onChange,
  className,
}: {
  value: CatalogPeriod;
  onChange: (period: CatalogPeriod) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Période : ${PERIOD_LABELS[value]}`}
          className={cn(CONTROL, className)}
        >
          <CalendarRange className={cn(CONTROL_ICON, 'text-muted-foreground')} />
          <span className="text-muted-foreground">Période ·</span>
          {PERIOD_SHORT[value]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {PERIOD_ORDER.map((period) => (
          <DropdownMenuItem
            key={period}
            onClick={() => onChange(period)}
            className="justify-between"
          >
            {PERIOD_LABELS[period]}
            {period === value && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
