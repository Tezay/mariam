import { ArrowDownNarrowWide, ArrowUpNarrowWide, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CONTROL, CONTROL_ICON } from './control';

export interface SortOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

/**
 * One control for both criterion and direction: picking the active criterion
 * again flips it, which is why no separate arrow button exists.
 */
export function SortMenu({
  options,
  value,
  ascending,
  onSort,
  className,
}: {
  options: SortOption[];
  value: string;
  ascending: boolean;
  onSort: (value: string) => void;
  className?: string;
}) {
  const Arrow = ascending ? ArrowUpNarrowWide : ArrowDownNarrowWide;
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Trier par ${current.label.toLowerCase()}, ordre ${ascending ? 'croissant' : 'décroissant'}`}
          className={cn(CONTROL, className)}
        >
          <Arrow className={cn(CONTROL_ICON, 'text-muted-foreground')} />
          {current.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onSort(option.value)}
            className="justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <option.icon className="h-3.5 w-3.5 text-muted-foreground" />
              {option.label}
            </span>
            {value === option.value && <Arrow className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
