import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { CalendarOff, Pencil } from 'lucide-react';
import type { DishCatalogItem, Event, MenuCategory, MenuItem } from '@/lib/api';
import type { DayData } from '../useCalendarData';
import { EventCard } from '../EventCard';
import { useMenuEditor } from '../day/useMenuEditor';
import { WeekCategoryBox } from './WeekCategoryBox';
import { AddMenuCTA } from './AddMenuCTA';
import { DayImportCsv } from '../day/DayImportCsv';
import { cn } from '@/lib/utils';
import { SelectionCheckbox } from '../selection/SelectionCheckbox';
import { ChefNotePopover } from '../day/ChefNotePopover';
import type { UseSelectionReturn } from '../selection/useSelection';
import { CLOSURE_HATCH_STYLE } from '../closure/closureStyle';
import { ClosureEditor } from '../closure/ClosureEditor';

const FR_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getDayOfWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return FR_DAYS[(d.getDay() + 6) % 7];
}

interface WeekDayColumnProps {
  date: string;
  isToday: boolean;
  dayData: DayData | undefined;
  restaurantId: number | undefined;
  canEdit: boolean;
  categories: MenuCategory[];
  selection: UseSelectionReturn;
  onStartOnboarding: (date: string) => void;
  onReload: () => void;
  onDirtyChange: (
    date: string,
    dirty: boolean,
    save: () => Promise<void>,
    reset: () => void
  ) => void;
  onRegisterDrop?: (
    fn: (categoryId: number, dishId: number, dish?: DishCatalogItem) => void
  ) => void;
  onRegisterRemove?: (fn: (itemId: number) => void) => void;
  onRegisterUpdateItem?: (fn: (itemId: number, changes: Partial<MenuItem>) => void) => void;
  onRegisterGetItems?: (fn: () => MenuItem[]) => void;
  onEditEvent?: (event: Event) => void;
}

export function WeekDayColumn({
  date,
  isToday,
  dayData,
  restaurantId,
  canEdit,
  categories,
  selection,
  onStartOnboarding,
  onReload,
  onDirtyChange,
  onRegisterDrop,
  onRegisterRemove,
  onRegisterUpdateItem,
  onRegisterGetItems,
  onEditEvent,
}: WeekDayColumnProps) {
  const dayNum = parseInt(date.split('-')[2], 10);
  const closure = dayData?.closure ?? null;
  const menu = dayData?.menu ?? null;
  const [closureEditorOpen, setClosureEditorOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | null>(null);

  const editor = useMenuEditor({ date, menu, restaurantId });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `week-col-drop-${date}`,
    data: { date },
  });

  // Keep latest save/reset in refs so the effect closure stays stable
  const saveRef = useRef(editor.save);
  const resetRef = useRef(editor.reset);
  useEffect(() => {
    saveRef.current = editor.save;
  }, [editor.save]);
  useEffect(() => {
    resetRef.current = editor.reset;
  }, [editor.reset]);

  // Expose addItem/removeItem to WeekView for cross-day drops (MOVE semantics)
  useEffect(() => {
    onRegisterDrop?.((categoryId, dishId, dish) => editor.addItem(categoryId, dishId, dish));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterDrop]);

  useEffect(() => {
    onRegisterRemove?.((itemId) => editor.removeItem(itemId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterRemove]);

  useEffect(() => {
    onRegisterUpdateItem?.((itemId, changes) => editor.updateItem(itemId, changes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterUpdateItem]);

  // Accesseur d'items vivants : lit toujours l'état courant de l'éditeur (ref).
  const itemsRef = useRef(editor.items);
  itemsRef.current = editor.items;
  useEffect(() => {
    onRegisterGetItems?.(() => itemsRef.current);
  }, [onRegisterGetItems]);

  useEffect(() => {
    onDirtyChange(
      date,
      editor.isDirty,
      () => saveRef.current(),
      () => resetRef.current()
    );
  }, [editor.isDirty, date, onDirtyChange]);

  const categoriesWithItems = categories
    .filter((cat) => cat.parent_id === null)
    .map((cat) => {
      const subIds = new Set((cat.subcategories ?? []).map((s) => s.id).concat([cat.id]));
      return {
        category: cat,
        items: editor.items.filter((item) => subIds.has(item.category_id)),
      };
    })
    .filter(({ items }) => items.length > 0);

  return (
    <div
      className={cn(
        'flex min-w-[200px] flex-1 flex-col border-r border-border',
        isToday && !closure && 'bg-primary/5'
      )}
      style={closure ? CLOSURE_HATCH_STYLE : undefined}
      data-day-date={date}
      data-day-menu-id={menu?.id}
    >
      {/* Header */}
      <div
        className={cn(
          'sticky top-0 z-20 flex min-h-[40px] items-center justify-center border-b border-border px-2',
          closure ? 'bg-card/95 backdrop-blur-sm' : 'bg-card',
          isToday && !closure && 'bg-primary/5 backdrop-blur-sm'
        )}
      >
        {/* Checkbox sélection du jour */}
        {selection.selectionMode && editor.items.length > 0 && (
          <div className="absolute left-2 top-1/2 -translate-y-1/2">
            <SelectionCheckbox
              state={selection.getGroupState(date, editor.items)}
              onToggle={() => selection.toggleGroup(date, editor.items)}
              aria-label={`Sélectionner ${getDayOfWeekLabel(date)} ${dayNum}`}
            />
          </div>
        )}

        {/* Note du chef (même emplacement que la checkbox, hors mode sélection) */}
        {!selection.selectionMode && canEdit && !closure && editor.items.length > 0 && (
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2">
            <ChefNotePopover editor={editor} compact side="bottom" align="start" />
          </div>
        )}

        {/* Titre du jour */}
        <p
          className={cn(
            'truncate px-8 text-center text-xs font-bold',
            closure
              ? 'text-muted-foreground'
              : isToday && !closure
                ? 'text-primary'
                : 'text-foreground'
          )}
        >
          {getDayOfWeekLabel(date).toUpperCase()} {dayNum}
        </p>

        {/* Contrôle publier/retirer (hors mode sélection) */}
        {canEdit &&
          !closure &&
          !selection.selectionMode &&
          (() => {
            const isEmpty = editor.items.length === 0;
            const showPublished = editor.menuStatus === 'published' && !isEmpty;
            const locked =
              editor.menuStatus === null || isEmpty || editor.isDirty || editor.isPublishing;
            const title = isEmpty
              ? 'Menu vide — ajoutez des plats pour publier'
              : editor.isDirty
                ? 'Enregistrez le menu avant de publier'
                : showPublished
                  ? 'Menu publié — cliquer pour dépublier'
                  : 'Brouillon — cliquer pour publier';
            return (
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    showPublished ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                />
                <button
                  type="button"
                  disabled={locked}
                  onClick={showPublished ? editor.unpublishMenu : editor.publishMenu}
                  title={title}
                  className={cn(
                    'rounded-lg px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    showPublished
                      ? 'text-muted-foreground hover:bg-muted'
                      : 'bg-primary text-white hover:bg-primary/90 disabled:bg-input disabled:text-muted-foreground'
                  )}
                >
                  {showPublished ? 'Retirer' : 'Publier'}
                </button>
              </div>
            );
          })()}
      </div>

      {/* Body */}
      {closure ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-card/50 p-4 text-center">
          <CalendarOff className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-xs font-medium leading-snug text-foreground">
            {closure.reason ?? 'Fermeture exceptionnelle'}
          </p>
          {closure.description && (
            <p className="text-[10px] leading-snug text-muted-foreground">{closure.description}</p>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setClosureEditorOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
              Modifier
            </button>
          )}
          {canEdit && (
            <ClosureEditor
              open={closureEditorOpen}
              closure={closure}
              onClose={() => setClosureEditorOpen(false)}
              onSaved={() => {
                setClosureEditorOpen(false);
                onReload();
              }}
            />
          )}
        </div>
      ) : (
        <div
          ref={setDropRef}
          className={cn(
            'flex-1 space-y-2 p-2 transition-colors',
            isOver && 'bg-primary/5 ring-1 ring-inset ring-primary/30'
          )}
        >
          {(dayData?.events ?? []).map((event) => (
            <EventCard key={event.id} event={event} compact onEdit={onEditEvent} />
          ))}
          {categoriesWithItems.length > 0 ? (
            categoriesWithItems.map(({ category, items }) => (
              <WeekCategoryBox
                key={category.id}
                category={category}
                items={items}
                editor={editor}
                canEdit={canEdit}
                selectionMode={selection.selectionMode}
                selection={selection}
                date={date}
                substitutions={editor.substitutions}
              />
            ))
          ) : canEdit ? (
            <AddMenuCTA
              date={date}
              restaurantId={restaurantId}
              onStartOnboarding={() => onStartOnboarding(date)}
              onImportCsv={() => setImportMode('csv')}
              onImported={onReload}
            />
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">Pas de menu</p>
          )}
          <DayImportCsv
            open={importMode === 'csv'}
            targetDate={date}
            restaurantId={restaurantId}
            categories={categories}
            onClose={() => setImportMode(null)}
            onImported={() => {
              setImportMode(null);
              onReload();
            }}
          />
        </div>
      )}
    </div>
  );
}
