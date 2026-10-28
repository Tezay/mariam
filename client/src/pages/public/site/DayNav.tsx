import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dayHref, dayLabel, type DayStrip } from './days';

const ARROW =
  'flex h-12 w-11 shrink-0 items-center justify-center rounded-xl bg-site-raised text-site-subtle transition-colors hover:text-site-text lg:h-11';

export function DayNav({
  strip,
  today,
  selected,
}: {
  strip: DayStrip;
  today: string;
  selected: string;
}) {
  return (
    <nav
      aria-label="Jour du menu"
      className="flex gap-2 overflow-x-auto border-b border-site-line bg-site-surface px-4 py-3 lg:flex-wrap lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 [&::-webkit-scrollbar]:hidden"
    >
      {strip.previous && (
        <Link
          to={dayHref(strip.previous, today)}
          preventScrollReset
          aria-label="Jours précédents"
          className={ARROW}
        >
          <ChevronLeft aria-hidden className="h-[18px] w-[18px]" />
        </Link>
      )}
      {strip.days.map((day) => {
        const label = dayLabel(day, today);
        const active = day === selected;
        return (
          <Link
            key={day}
            to={dayHref(day, today)}
            preventScrollReset
            aria-current={active ? 'date' : undefined}
            className={cn(
              'flex h-12 shrink-0 flex-col items-center justify-center rounded-xl px-4 lg:h-11',
              active ? 'bg-site-brand-solid text-white' : 'bg-site-raised text-site-text'
            )}
          >
            <span className="text-sm font-bold leading-tight lg:hidden">{label.name}</span>
            <span
              className={cn('text-[11px] font-medium lg:hidden', !active && 'text-site-subtle')}
            >
              {label.date}
            </span>
            <span className="hidden text-sm font-bold lg:inline">{label.compact}</span>
          </Link>
        );
      })}
      {strip.next && (
        <Link
          to={dayHref(strip.next, today)}
          preventScrollReset
          aria-label="Jours suivants"
          className={ARROW}
        >
          <ChevronRight aria-hidden className="h-[18px] w-[18px]" />
        </Link>
      )}
    </nav>
  );
}
