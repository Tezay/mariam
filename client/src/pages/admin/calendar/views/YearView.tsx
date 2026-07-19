import { useState, useCallback, useEffect } from 'react';
import { closuresApi, menusApi, adminApi } from '@/lib/api';
import type { ExceptionalClosure, CalendarSettings } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import type { CalendarData } from '../useCalendarData';
import type { DesktopView, MobileView } from '../CalendarToolbar';
import { ClosureEditor } from '../closure/ClosureEditor';
import { CLOSURE_HATCH_STYLE } from '../closure/closureStyle';
import { DragMode, orderDates } from '../closure/closureDrag';

// ─── Constants ────────────────────────────────────────────────────────────────

const FR_MONTHS = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const back = (d.getDay() + 6) % 7;
  return addDays(dateStr, -back);
}

function getMonthGrid(year: number, month: number): string[] {
  const mm = String(month + 1).padStart(2, '0');
  const firstDay = `${year}-${mm}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDay = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
  const gridStart = getMondayOf(firstDay);
  const gridEnd = addDays(getMondayOf(lastDay), 6);
  const days: string[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function getDragStyle(date: string, drag: DragMode | null): string {
  if (!drag) return '';
  if (drag.kind === 'selecting') {
    const [lo, hi] = orderDates(drag.start, drag.hover);
    if (date >= lo && date <= hi) return 'bg-primary/20 rounded';
  } else {
    const { closure, handle, hover } = drag;
    const newStart = handle === 'start' ? hover : closure.start_date;
    const newEnd = handle === 'end' ? hover : closure.end_date;
    const [lo, hi] = orderDates(newStart, newEnd);
    if (date >= lo && date <= hi) return 'bg-primary/30';
  }
  return '';
}

// ─── Mini-month ───────────────────────────────────────────────────────────────

interface MiniMonthProps {
  year: number;
  month: number;
  today: string;
  data: CalendarData;
  drag: DragMode | null;
  canEdit: boolean;
  joursFeries: Record<string, string>;
  vacanceDates: Set<string>;
  onMonthClick: () => void;
  onDayMouseDown: (date: string) => void;
  onDayMouseEnter: (date: string) => void;
}

function MiniMonth({
  year,
  month,
  today,
  data,
  drag,
  canEdit,
  joursFeries,
  vacanceDates,
  onMonthClick,
  onDayMouseDown,
  onDayMouseEnter,
}: MiniMonthProps) {
  const mm = String(month + 1).padStart(2, '0');
  const firstDay = `${year}-${mm}-01`;
  const lastDay = `${year}-${mm}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  const days = getMonthGrid(year, month);

  return (
    <div className="select-none rounded-2xl border border-border bg-card p-3">
      <button
        type="button"
        onClick={onMonthClick}
        className="mb-2 w-full text-left text-xs font-semibold text-foreground transition-colors hover:text-primary"
      >
        {FR_MONTHS[month]}
      </button>

      <div className="mb-1 grid grid-cols-7">
        {FR_DAYS_MINI.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((date) => {
          const isCurrentMonth = date >= firstDay && date <= lastDay;
          const dayNum = parseInt(date.split('-')[2], 10);
          const isToday = date === today;
          const closure = data[date]?.closure ?? null;
          const isClosure = !!closure && isCurrentMonth;
          const hasEvent = (data[date]?.events?.length ?? 0) > 0 && isCurrentMonth && !isClosure;
          const ferieDesc = isCurrentMonth ? (joursFeries[date] ?? null) : null;
          const isVacance = isCurrentMonth && !isClosure && !ferieDesc && vacanceDates.has(date);

          const dragStyle = getDragStyle(date, drag);
          const isBoundary =
            isClosure && canEdit && (date === closure!.start_date || date === closure!.end_date);

          return (
            <div
              key={date}
              title={ferieDesc ?? (isVacance ? 'Vacances scolaires' : undefined)}
              className={cn(
                'relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center',
                !isCurrentMonth && 'opacity-25',
                isBoundary && 'cursor-col-resize',
                !isClosure && 'rounded-sm',
                dragStyle,
                !dragStyle &&
                  !isClosure &&
                  isToday &&
                  'rounded-full bg-primary font-bold text-white',
                !dragStyle && !isClosure && !isToday && ferieDesc && 'text-amber-600',
                !dragStyle &&
                  !isClosure &&
                  !isToday &&
                  isVacance &&
                  'rounded-sm bg-violet-50 text-violet-600 dark:bg-violet-950/20 dark:text-violet-400',
                !dragStyle &&
                  !isClosure &&
                  !isToday &&
                  !ferieDesc &&
                  !isVacance &&
                  'rounded-sm hover:bg-muted'
              )}
              style={isClosure && !dragStyle ? CLOSURE_HATCH_STYLE : undefined}
              onMouseDown={() => isCurrentMonth && onDayMouseDown(date)}
              onMouseEnter={() => onDayMouseEnter(date)}
            >
              <span
                className={cn('text-[10px]', !dragStyle && !isClosure && isToday && 'font-bold')}
              >
                {dayNum}
              </span>
              {ferieDesc && !isClosure && !isToday && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-500" />
              )}
              {hasEvent && !ferieDesc && (
                <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── YearView ────────────────────────────────────────────────────────────────

interface YearViewProps {
  year: number;
  data: CalendarData;
  canEdit: boolean;
  calendarSettings?: CalendarSettings;
  onNavigate: (view: DesktopView | MobileView, date: string) => void;
  onReload: () => void;
}

export function YearView({
  year,
  data,
  canEdit,
  calendarSettings,
  onNavigate,
  onReload,
}: YearViewProps) {
  const today = parisToday();
  const months = Array.from({ length: 12 }, (_, i) => i);

  const [drag, setDrag] = useState<DragMode | null>(null);
  const [mouseHasMoved, setMouseHasMoved] = useState(false);
  const [closureEditorOpen, setClosureEditorOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<ExceptionalClosure | null>(null);
  const [closurePrefill, setClosurePrefill] = useState<{ start: string; end: string } | null>(null);
  const [joursFeries, setJoursFeries] = useState<Record<string, string>>({});
  const [vacanceDates, setVacanceDates] = useState<Set<string>>(new Set());

  const showHolidays = calendarSettings?.show_public_holidays ?? true;
  const showVacances = calendarSettings?.show_school_vacations ?? false;
  const vacanceZone = calendarSettings?.school_vacation_zone ?? null;

  useEffect(() => {
    if (!showHolidays) {
      setJoursFeries({});
      return;
    }
    menusApi
      .getJoursFeries(year)
      .then((list) => {
        const map: Record<string, string> = {};
        for (const { date, description } of list) map[date] = description;
        setJoursFeries(map);
      })
      .catch(() => {});
  }, [year, showHolidays]);

  useEffect(() => {
    if (!showVacances || !vacanceZone) {
      setVacanceDates(new Set());
      return;
    }
    adminApi
      .getVacancesScolaires(year, vacanceZone)
      .then((list) => {
        const dates = new Set<string>();
        for (const { start_date, end_date } of list) {
          let cur = start_date;
          while (cur <= end_date) {
            dates.add(cur);
            const d = new Date(cur + 'T12:00:00');
            d.setDate(d.getDate() + 1);
            cur = d.toISOString().split('T')[0];
          }
        }
        setVacanceDates(dates);
      })
      .catch(() => {});
  }, [year, showVacances, vacanceZone]);

  const handleDayMouseDown = useCallback(
    (date: string) => {
      if (!canEdit) return;
      const closure = data[date]?.closure ?? null;
      setMouseHasMoved(false);
      if (closure) {
        const handle =
          date === closure.start_date ? 'start' : date === closure.end_date ? 'end' : null;
        if (handle) {
          setDrag({ kind: 'handle', closure, handle, hover: date });
          return;
        }
      }
      setDrag({ kind: 'selecting', start: date, hover: date });
    },
    [canEdit, data]
  );

  const handleDayMouseEnter = useCallback((date: string) => {
    setDrag((prev) => {
      if (!prev) return prev;
      if (prev.hover !== date) setMouseHasMoved(true);
      return { ...prev, hover: date };
    });
  }, []);

  const handleMouseUp = useCallback(async () => {
    if (!drag) return;

    if (drag.kind === 'selecting') {
      const [start, end] = orderDates(drag.start, drag.hover);
      setDrag(null);
      if (!mouseHasMoved) {
        // Simple click
        const closure = data[drag.start]?.closure ?? null;
        if (closure && canEdit) {
          setEditingClosure(closure);
          setClosurePrefill(null);
          setClosureEditorOpen(true);
        } else {
          onNavigate('day', drag.start);
        }
      } else if (start === end) {
        onNavigate('day', start);
      } else {
        setEditingClosure(null);
        setClosurePrefill({ start, end });
        setClosureEditorOpen(true);
      }
    } else {
      const { closure, handle, hover } = drag;
      setDrag(null);
      if (hover === (handle === 'start' ? closure.start_date : closure.end_date)) return;
      const newStart = handle === 'start' ? hover : closure.start_date;
      const newEnd = handle === 'end' ? hover : closure.end_date;
      const [lo, hi] = orderDates(newStart, newEnd);
      try {
        await closuresApi.update(closure.id, { start_date: lo, end_date: hi });
        onReload();
      } catch {
        /* ignore */
      }
    }
  }, [drag, mouseHasMoved, data, canEdit, onNavigate, onReload]);

  useEffect(() => {
    const up = () => {
      if (drag) handleMouseUp();
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [drag, handleMouseUp]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
        {months.map((m) => (
          <MiniMonth
            key={m}
            year={year}
            month={m}
            today={today}
            data={data}
            drag={drag}
            canEdit={canEdit}
            joursFeries={joursFeries}
            vacanceDates={vacanceDates}
            onMonthClick={() => onNavigate('month', `${year}-${String(m + 1).padStart(2, '0')}-01`)}
            onDayMouseDown={handleDayMouseDown}
            onDayMouseEnter={handleDayMouseEnter}
          />
        ))}
      </div>

      <ClosureEditor
        open={closureEditorOpen}
        closure={editingClosure}
        prefillStart={closurePrefill?.start}
        prefillEnd={closurePrefill?.end}
        onClose={() => {
          setClosureEditorOpen(false);
          setEditingClosure(null);
          setClosurePrefill(null);
        }}
        onSaved={() => {
          setClosureEditorOpen(false);
          setEditingClosure(null);
          setClosurePrefill(null);
          onReload();
        }}
      />
    </div>
  );
}
