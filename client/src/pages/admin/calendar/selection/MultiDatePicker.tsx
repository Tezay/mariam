import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

const FR_MONTHS_LONG = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
const FR_DAYS_MINI = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const back = (d.getDay() + 6) % 7;
  return addDays(dateStr, -back);
}

function getMonthGrid(year: number, month: number): string[] {
  const mm = String(month + 1).padStart(2, '0');
  const first = `${year}-${mm}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const last = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
  const start = getMondayOf(first);
  const end = addDays(getMondayOf(last), 6);
  const days: string[] = [];
  let c = start;
  while (c <= end) {
    days.push(c);
    c = addDays(c, 1);
  }
  return days;
}

interface MultiDatePickerProps {
  selected: Set<string>;
  onChange: (dates: Set<string>) => void;
}

export function MultiDatePicker({ selected, onChange }: MultiDatePickerProps) {
  const today = parisToday();
  const d = new Date(today + 'T12:00:00');
  const [year, setYear] = useState(d.getFullYear());
  const [month, setMonth] = useState(d.getMonth());

  const mm = String(month + 1).padStart(2, '0');
  const firstDay = `${year}-${mm}-01`;
  const lastDay = `${year}-${mm}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  const days = getMonthGrid(year, month);

  const prevMonth = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  };

  const toggle = (date: string) => {
    const next = new Set(selected);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="rounded-lg p-1 hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {FR_MONTHS_LONG[month]} {year}
        </span>
        <button type="button" onClick={nextMonth} className="rounded-lg p-1 hover:bg-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {FR_DAYS_MINI.map((dl, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">
            {dl}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((date) => {
          const isCurrentMonth = date >= firstDay && date <= lastDay;
          const isSelected = selected.has(date);
          const dayNum = parseInt(date.split('-')[2], 10);
          return (
            <button
              key={date}
              type="button"
              disabled={!isCurrentMonth}
              onClick={() => toggle(date)}
              className={cn(
                'aspect-square w-full rounded-md text-[11px] font-medium transition-colors',
                !isCurrentMonth && 'pointer-events-none opacity-20',
                isSelected && 'bg-primary text-white',
                !isSelected && isCurrentMonth && 'hover:bg-muted'
              )}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}
