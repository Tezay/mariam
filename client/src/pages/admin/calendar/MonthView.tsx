import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { closuresApi } from '@/lib/api';
import type { Event, ExceptionalClosure, MenuCategory, MenuItem } from '@/lib/api';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { getCategoryColor } from '@/lib/category-colors';
import { generateEventPalette } from '@/lib/color-utils';
import type { CalendarData } from './useCalendarData';
import type { DesktopView, MobileView } from './CalendarToolbar';
import { CLOSURE_HATCH_STYLE } from './closure/closureStyle';
import { DragMode, orderDates } from './closure/closureDrag';
import { ClosureEditor } from './closure/ClosureEditor';
import { MenuCopyPopover } from './selection/MenuCopyPopover';

const FR_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeekContaining(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const back = (d.getDay() + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - back);
  return m.toISOString().split('T')[0];
}

function groupItemsByCategory(
  items: MenuItem[],
  categories: MenuCategory[]
): Array<{ category: MenuCategory; items: MenuItem[] }> {
  const map = new Map<number, { category: MenuCategory; items: MenuItem[] }>();
  for (const cat of categories) {
    map.set(cat.id, { category: cat, items: [] });
  }
  for (const item of items) {
    const entry = map.get(item.category_id);
    if (entry) entry.items.push(item);
  }
  return Array.from(map.values()).filter((e) => e.items.length > 0);
}

function getDragPreviewStyle(date: string, drag: DragMode | null): string {
  if (!drag) return '';
  if (drag.kind === 'selecting') {
    const [lo, hi] = orderDates(drag.start, drag.hover);
    if (date >= lo && date <= hi) return 'bg-primary/20';
  } else {
    const { closure, handle, hover } = drag;
    const newStart = handle === 'start' ? hover : closure.start_date;
    const newEnd = handle === 'end' ? hover : closure.end_date;
    const [lo, hi] = orderDates(newStart, newEnd);
    if (date >= lo && date <= hi) return 'bg-primary/30';
  }
  return '';
}

// ─── CompactCategoryBox ───────────────────────────────────────────────────────

function CompactCategoryBox({ category, items }: { category: MenuCategory; items: MenuItem[] }) {
  const color = getCategoryColor(category.color_key, category.order);
  return (
    <div
      className="mb-0.5 rounded-xl px-1.5 pb-1.5 pt-1 last:mb-0"
      style={{ backgroundColor: color.bg, borderBottom: `3px solid ${color.border}` }}
    >
      <p
        className="mb-0.5 truncate text-center text-[8px] font-bold uppercase tracking-wide"
        style={{ color: color.label + 'CC' }}
      >
        {category.label}
      </p>
      {items.map((item, i) => (
        <p key={i} className="truncate text-[9px] leading-tight" style={{ color: color.label }}>
          {item.dish?.name ?? ''}
        </p>
      ))}
    </div>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

interface MonthViewProps {
  year: number;
  month: number;
  data: CalendarData;
  canEdit: boolean;
  serviceDays: number[];
  categories: MenuCategory[];
  restaurantId?: number;
  onNavigate: (view: DesktopView | MobileView, date: string) => void;
  onReload: () => void;
  onEditEvent?: (event: Event) => void;
}

export function MonthView({
  year,
  month,
  data,
  canEdit,
  serviceDays,
  categories,
  restaurantId,
  onNavigate,
  onReload,
  onEditEvent,
}: MonthViewProps) {
  const today = parisToday();

  const [drag, setDrag] = useState<DragMode | null>(null);
  const [mouseHasMoved, setMouseHasMoved] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<ExceptionalClosure | null>(null);
  const [closurePrefill, setClosurePrefill] = useState<{ start: string; end: string } | null>(null);
  const [pendingRange, setPendingRange] = useState<{ start: string; end: string } | null>(null);

  // Items à dupliquer = tous les plats des jours de la plage sélectionnée
  const rangeItems = useMemo<MenuItem[]>(() => {
    if (!pendingRange) return [];
    const items: MenuItem[] = [];
    let c = pendingRange.start;
    while (c <= pendingRange.end) {
      const menu = data[c]?.menu;
      if (menu?.items) items.push(...menu.items);
      c = addDays(c, 1);
    }
    return items;
  }, [pendingRange, data]);

  const mm = String(month + 1).padStart(2, '0');
  const firstDay = `${year}-${mm}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lastDay = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;

  const gridStart = getMondayOfWeekContaining(firstDay);
  const gridEnd = addDays(getMondayOfWeekContaining(lastDay), 6);

  const gridDays: string[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    gridDays.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const serviceColIndices = new Set(serviceDays);

  // ─── Drag handlers ────────────────────────────────────────────────────────

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
          setEditorOpen(true);
        } else {
          onNavigate('day', drag.start);
        }
      } else if (start === end) {
        onNavigate('day', start);
      } else {
        // Multi-day drag → show choice bar (duplicate or create closure)
        setPendingRange({ start, end });
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
    <div className="flex-1 overflow-auto">
      <div className="min-w-[500px]">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-l border-t border-border">
          {FR_DAYS_SHORT.map((d, i) => (
            <div
              key={d}
              className={cn(
                'border-b border-r border-border py-2 text-center text-xs font-semibold uppercase tracking-wide',
                serviceColIndices.has(i)
                  ? 'text-muted-foreground'
                  : 'bg-muted/20 text-muted-foreground/30'
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 border-l border-border">
          {gridDays.map((date, idx) => {
            const colIdx = idx % 7;
            const isServiceDay = serviceColIndices.has(colIdx);
            const isCurrentMonth = date >= firstDay && date <= lastDay;
            const isToday = date === today;
            const dayNum = parseInt(date.split('-')[2], 10);
            const dayData = data[date];
            const closure = dayData?.closure ?? null;
            const isClosureDay = !!closure && isCurrentMonth;

            // Horizontal joining: hide right border between consecutive closure cells in same row
            const nextDate = addDays(date, 1);
            const nextHasClosure = isClosureDay && !!data[nextDate]?.closure && colIdx < 6;

            const menu = dayData?.menu ?? null;
            const groups =
              menu && categories.length > 0
                ? groupItemsByCategory(menu.items ?? [], categories)
                : [];

            const dragStyle = getDragPreviewStyle(date, drag);

            // Cursor logic
            const isBoundary =
              isClosureDay &&
              canEdit &&
              (date === closure!.start_date || date === closure!.end_date);
            const cursorClass = isBoundary
              ? 'cursor-col-resize'
              : isClosureDay && canEdit
                ? 'cursor-pointer'
                : isClosureDay
                  ? ''
                  : isCurrentMonth && isServiceDay
                    ? 'cursor-pointer'
                    : '';

            return (
              <div
                key={date}
                className={cn(
                  'relative flex min-h-[120px] select-none flex-col border-b p-1 transition-colors',
                  nextHasClosure ? 'border-r border-r-transparent' : 'border-r border-border',
                  !isCurrentMonth && 'bg-muted/20',
                  !isServiceDay && isCurrentMonth && !isClosureDay && 'bg-muted/10',
                  dragStyle && dragStyle,
                  cursorClass
                )}
                style={isClosureDay && !dragStyle ? CLOSURE_HATCH_STYLE : undefined}
                onMouseDown={() => isCurrentMonth && handleDayMouseDown(date)}
                onMouseEnter={() => handleDayMouseEnter(date)}
              >
                {/* Day number */}
                <div className="mb-1 flex items-center justify-end">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                      isToday && !isClosureDay
                        ? 'bg-primary text-white'
                        : isCurrentMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground/40',
                      !isServiceDay && isCurrentMonth && 'opacity-40',
                      isClosureDay && 'bg-card/80 text-foreground'
                    )}
                  >
                    {dayNum}
                  </span>
                </div>

                {/* Closure label on first day */}
                {isClosureDay && closure!.start_date === date && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-start justify-end p-1">
                    <span className="max-w-full truncate rounded bg-card/80 px-1 text-[9px] font-semibold text-muted-foreground">
                      {closure!.reason ?? 'Fermé'}
                    </span>
                  </div>
                )}

                {/* Events */}
                {!isClosureDay &&
                  (dayData?.events ?? []).map((event) => {
                    const evPalette = generateEventPalette(event.color || '#3498DB');
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onEditEvent?.(event)}
                        className="mb-0.5 w-full px-0.5 text-left"
                      >
                        <p
                          className="truncate rounded border px-1 py-0.5 text-[9px] font-semibold"
                          style={{
                            backgroundColor: evPalette.bg,
                            borderColor: evPalette.border,
                            color: evPalette.text,
                          }}
                        >
                          {event.title}
                        </p>
                      </button>
                    );
                  })}

                {/* Category boxes */}
                {!isClosureDay && isServiceDay && groups.length > 0 && (
                  <div
                    className={cn('mt-0.5 flex-1 overflow-y-auto', !isCurrentMonth && 'opacity-60')}
                  >
                    {groups.map(({ category, items }) => (
                      <CompactCategoryBox key={category.id} category={category} items={items} />
                    ))}
                  </div>
                )}

                {/* Bouton + : naviguer vers vue jour pour créer/compléter le menu */}
                {!isClosureDay && isServiceDay && isCurrentMonth && canEdit && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('day', date);
                    }}
                    className="mt-auto flex w-full items-center justify-center gap-0.5 py-0.5 text-[9px] text-muted-foreground opacity-0 transition-colors hover:text-primary hover:opacity-100"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {menu ? 'Ajouter' : 'Créer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ClosureEditor
        open={editorOpen}
        closure={editingClosure}
        prefillStart={closurePrefill?.start}
        prefillEnd={closurePrefill?.end}
        onClose={() => {
          setEditorOpen(false);
          setEditingClosure(null);
          setClosurePrefill(null);
        }}
        onSaved={() => {
          setEditorOpen(false);
          setEditingClosure(null);
          setClosurePrefill(null);
          onReload();
        }}
      />

      {/* Pending range action bar */}
      {pendingRange && canEdit && (
        <div className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
          <span className="flex-1 text-xs text-muted-foreground">
            {pendingRange.start} → {pendingRange.end}
          </span>
          <MenuCopyPopover
            direction="export"
            sourceItems={rangeItems}
            restaurantId={restaurantId}
            onDone={() => {
              setPendingRange(null);
              onReload();
            }}
            align="end"
          >
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
            >
              <Copy className="h-3.5 w-3.5" />
              Dupliquer
            </button>
          </MenuCopyPopover>
          <button
            type="button"
            onClick={() => {
              setClosurePrefill(pendingRange);
              setPendingRange(null);
              setEditorOpen(true);
            }}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Créer fermeture
          </button>
          <button
            type="button"
            onClick={() => setPendingRange(null)}
            className="px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
