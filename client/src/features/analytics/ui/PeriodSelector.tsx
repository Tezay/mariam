import { useState } from 'react';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PERIOD_OPTIONS, type PeriodKey, type PresetPeriod } from '../hooks/useAnalyticsFilters';
import { formatDayLabel } from '../format';

interface PeriodSelectorProps {
  period: PeriodKey;
  start?: string;
  end?: string;
  onPeriodChange: (period: PresetPeriod) => void;
  onCustomRange: (start: string, end: string) => void;
}

const dateInputClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function CustomRangeFields({
  start,
  end,
  onApply,
}: {
  start?: string;
  end?: string;
  onApply: (start: string, end: string) => void;
}) {
  const [draftStart, setDraftStart] = useState(start ?? '');
  const [draftEnd, setDraftEnd] = useState(end ?? '');
  const today = new Date().toISOString().slice(0, 10);
  const canApply = Boolean(draftStart && draftEnd && draftStart <= draftEnd);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground" htmlFor="period-start">
          Du
        </label>
        <input
          id="period-start"
          type="date"
          max={today}
          value={draftStart}
          onChange={(event) => setDraftStart(event.target.value)}
          className={dateInputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground" htmlFor="period-end">
          Au
        </label>
        <input
          id="period-end"
          type="date"
          max={today}
          value={draftEnd}
          onChange={(event) => setDraftEnd(event.target.value)}
          className={dateInputClass}
        />
      </div>
      <Button
        size="sm"
        className="w-full rounded-xl"
        disabled={!canApply}
        onClick={() => canApply && onApply(draftStart, draftEnd)}
      >
        Appliquer
      </Button>
    </div>
  );
}

export function PeriodSelector({
  period,
  start,
  end,
  onPeriodChange,
  onCustomRange,
}: PeriodSelectorProps) {
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isCustom = period === 'custom';

  const currentLabel =
    isCustom && start && end
      ? `${formatDayLabel(start)} – ${formatDayLabel(end)}`
      : (PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Période');

  return (
    <>
      {/* Mobile: one control instead of a segmented bar plus a second button. */}
      <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl text-xs sm:hidden">
            <CalendarRange className="h-4 w-4 shrink-0" />
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <div className="space-y-1">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onPeriodChange(option.value);
                  setMobileOpen(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted',
                  !isCustom && period === option.value
                    ? 'font-medium text-primary'
                    : 'text-foreground'
                )}
              >
                {option.label}
                {!isCustom && period === option.value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plage personnalisée
            </p>
            <CustomRangeFields
              start={start}
              end={end}
              onApply={(from, to) => {
                onCustomRange(from, to);
                setMobileOpen(false);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <ToggleGroup
          type="single"
          value={isCustom ? '' : period}
          onValueChange={(value) => value && onPeriodChange(value as PresetPeriod)}
          className="rounded-xl border border-border bg-card p-0.5"
        >
          {PERIOD_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              className="h-8 rounded-lg px-3 text-xs font-medium data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-9 gap-2 rounded-xl text-xs font-medium',
                isCustom && 'border-primary/40 bg-primary/10 text-primary'
              )}
            >
              <CalendarRange className="h-4 w-4" />
              {isCustom && start && end ? currentLabel : 'Personnalisé'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <CustomRangeFields
              start={start}
              end={end}
              onApply={(from, to) => {
                onCustomRange(from, to);
                setDesktopOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
