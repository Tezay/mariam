import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BookOpen,
  CheckSquare,
  Copy,
  Eye,
  EyeOff,
  FileUp,
  Package,
  PackageX,
  Plus,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useSiteRef } from '@/contexts/SiteContext';
import { menusApi, type MenuDish } from '@/lib/api/menus';
import { dishesApi } from '@/lib/api/dishes';
import type { Dish } from '@/lib/api/dishes';
import type { MenuCategory } from '@/lib/api/categories';
import { editorItems, type EditorItem } from '@/pages/admin/calendar/day/useMenuEditor';
import { getCategoryColor } from '@/lib/category-colors';
import { addDays, parisToday } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CalendarData } from './useCalendarData';
import { WeekDayColumn } from './week/WeekDayColumn';
import { WeekMenuItemBoxGhost } from './week/WeekMenuItemBoxGhost';
import { useRubberBand } from '@/hooks/useRubberBand';
import { useSelection } from './selection/useSelection';
import { SelectionToolbar } from './selection/SelectionToolbar';
import { MenuCopyPopover } from './selection/MenuCopyPopover';

interface WeekViewProps {
  weekStart: string;
  data: CalendarData;
  canEdit: boolean;
  serviceDays: number[];
  categories: MenuCategory[];
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onEditEvent?: (event: import('@/lib/api/events').Event) => void;
  onStartOnboarding?: (date: string) => void;
}

export function WeekView({
  weekStart,
  data,
  canEdit,
  serviceDays,
  categories,
  onReload,
  onDirtyChange,
  onEditEvent,
  onStartOnboarding,
}: WeekViewProps) {
  const site = useSiteRef();
  const today = parisToday();
  const navigate = useNavigate();
  const selection = useSelection();

  // Once the Radix context menu has closed and given focus back: a dialog opened
  // before that leaves aria-hidden and pointer-events stuck.
  const runAfterMenuClose = (fn: () => void) => requestAnimationFrame(fn);

  // Auto-exit selection mode when all items are deselected
  const hadSelectionRef = useRef(false);
  const { toggleSelectionMode } = selection;
  useEffect(() => {
    if (selection.selectedItemCount > 0) hadSelectionRef.current = true;
    if (selection.selectionMode && selection.selectedItemCount === 0 && hadSelectionRef.current) {
      hadSelectionRef.current = false;
      toggleSelectionMode();
    }
  }, [selection.selectedItemCount, selection.selectionMode, toggleSelectionMode]);

  const saveCallbacksRef = useRef<Record<string, { save: () => Promise<void>; reset: () => void }>>(
    {}
  );
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);

  const [activeDragItem, setActiveDragItem] = useState<{
    item: EditorItem;
    color: ReturnType<typeof getCategoryColor>;
  } | null>(null);
  const [multiDragItems, setMultiDragItems] = useState<EditorItem[]>([]);

  // Alt (Option) turns a move into a copy.
  const altHeldRef = useRef(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      altHeldRef.current = e.altKey;
      setIsCopyMode(e.altKey);
    };
    window.addEventListener('keydown', onKey, { passive: true });
    window.addEventListener('keyup', onKey, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);
  const dropHandlersRef = useRef<
    Record<string, (categoryId: number, dishId: number, dish?: MenuDish) => void>
  >({});
  const removeHandlersRef = useRef<Record<string, (itemId: number) => void>>({});
  const updateItemHandlersRef = useRef<
    Record<string, (itemId: number, changes: Partial<EditorItem>) => void>
  >({});
  const getItemsHandlersRef = useRef<Record<string, () => EditorItem[]>>({});

  const handleBulkMarkOos = useCallback(() => {
    for (const entry of selection.selection) {
      if (entry.type !== 'item') continue;
      updateItemHandlersRef.current[entry.date]?.(entry.itemId, { is_out_of_stock: true });
    }
    selection.clearSelection();
  }, [selection]);

  const handleBulkMarkInStock = useCallback(() => {
    for (const entry of selection.selection) {
      if (entry.type !== 'item') continue;
      updateItemHandlersRef.current[entry.date]?.(entry.itemId, { is_out_of_stock: false });
    }
    selection.clearSelection();
  }, [selection]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const d = event.active.data.current as
        | {
            item: EditorItem;
            color: ReturnType<typeof getCategoryColor>;
            categoryId: number;
            date?: string;
          }
        | undefined;
      if (!d) return;
      setActiveDragItem({ item: d.item, color: d.color });

      const draggedId = d.item.id;
      const isInSelection = selection.selection.some(
        (e) => e.type === 'item' && e.itemId === draggedId
      );
      if (isInSelection && d.date) {
        const sourceDate = d.date;
        const multi = selection.selection
          .filter((e) => e.type === 'item' && e.date === sourceDate)
          .map((e) => {
            if (e.type !== 'item') return null;
            return editorItems(data[sourceDate]?.menu ?? null).find((i) => i.id === e.itemId) ?? null;
          })
          .filter((i): i is EditorItem => i !== null);
        setMultiDragItems(multi.length > 1 ? multi : []);
      } else {
        setMultiDragItems([]);
      }
    },
    [selection.selection, data]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentMultiDragItems = multiDragItems;
      setActiveDragItem(null);
      setMultiDragItems([]);

      const { over, active } = event;
      if (!over) return;

      const dragData = active.data.current as
        | { dishId?: number; categoryId?: number; date?: string; item?: EditorItem }
        | undefined;
      const dropData = over.data.current as { date?: string } | undefined;
      if (!dragData?.dishId || !dragData.categoryId || !dragData.date || !dropData?.date) return;

      if (dragData.date === dropData.date) return;

      const dropHandler = dropHandlersRef.current[dropData.date];
      const removeHandler = removeHandlersRef.current[dragData.date];
      const isCopy = altHeldRef.current;

      if (currentMultiDragItems.length > 1) {
        for (const item of currentMultiDragItems) {
          if (item.dish_id != null) {
            dropHandler?.(item.category_id, item.dish_id, item.dish);
          }
          if (item.id != null && !isCopy) {
            removeHandler?.(item.id);
          }
        }
      } else {
        dropHandler?.(dragData.categoryId, dragData.dishId, dragData.item?.dish);
        if (dragData.item?.id != null && !isCopy) {
          removeHandler?.(dragData.item.id);
        }
      }

      selection.clearSelection();
    },
    [multiDragItems, selection]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragItem(null);
  }, []);

  const anyDirty = dirtyDates.size > 0;

  useEffect(() => {
    onDirtyChange?.(anyDirty);
  }, [anyDirty, onDirtyChange]);

  const handleColumnDirtyChange = useCallback(
    (date: string, dirty: boolean, save: () => Promise<void>, reset: () => void) => {
      if (dirty) {
        saveCallbacksRef.current[date] = { save, reset };
      } else {
        delete saveCallbacksRef.current[date];
      }
      setDirtyDates((prev) => {
        const next = new Set(prev);
        if (dirty) next.add(date);
        else next.delete(date);
        return next;
      });
    },
    []
  );

  const handleSaveAll = useCallback(async () => {
    setIsSavingAll(true);
    try {
      await Promise.all(Object.values(saveCallbacksRef.current).map(({ save }) => save()));
    } finally {
      setIsSavingAll(false);
    }
  }, []);

  const handleResetAll = useCallback(() => {
    Object.values(saveCallbacksRef.current).forEach(({ reset }) => reset());
  }, []);

  type ContextTarget =
    | { type: 'day'; date: string; hasMenu: boolean; menuStatus?: 'draft' | 'published' | null }
    | {
        type: 'item';
        date: string;
        itemId: number;
        isOos: boolean;
        dishId?: number | null;
      };

  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [contextImportDate, setContextImportDate] = useState<string | null>(null);
  const [contextDupeItems, setContextDupeItems] = useState<EditorItem[] | null>(null);
  const [dupeAnchor, setDupeAnchor] = useState<{ x: number; y: number } | null>(null);
  const [deleteMenuTarget, setDeleteMenuTarget] = useState<{ date: string } | null>(null);
  const [isDeletingMenu, setIsDeletingMenu] = useState(false);

  const handleDeleteMenu = useCallback(async () => {
    if (!deleteMenuTarget) return;
    setIsDeletingMenu(true);
    try {
      await menusApi.remove(site, deleteMenuTarget.date);
      setDeleteMenuTarget(null);
      onReload();
    } catch {
      /* The menu stays, and so does the dialog. */
    } finally {
      setIsDeletingMenu(false);
    }
  }, [site, deleteMenuTarget, onReload]);
  const [pendingAddDish, setPendingAddDish] = useState<{
    date: string;
    categoryId: number;
  } | null>(null);
  const [addDishCatalog, setAddDishCatalog] = useState<Dish[]>([]);
  const [addDishLoading, setAddDishLoading] = useState(false);

  const columnsContainerRef = useRef<HTMLDivElement>(null);
  const lasso = useRubberBand({
    containerRef: columnsContainerRef,
    itemSelector: '[data-menu-item-id]',
    enabled: canEdit && !activeDragItem,
    onSelect: (elements) => {
      const entries = elements.flatMap((element) => {
        const itemId = Number(element.dataset.menuItemId);
        const date = element.dataset.menuItemDate ?? '';
        const categoryId = Number(element.dataset.menuItemCategoryId ?? '0');
        if (!itemId || !date || !categoryId) return [];
        return [{ type: 'item' as const, itemId, date, categoryId }];
      });
      if (entries.length > 0) selection.selectMultiple(entries);
    },
  });

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // A modal opening on the gesture can swallow the pointerup
      lasso.reset();

      if (!canEdit) return;
      setDupeAnchor({ x: e.clientX, y: e.clientY });
      const target = e.target as HTMLElement;
      const itemEl = target.closest('[data-menu-item-id]') as HTMLElement | null;
      if (itemEl) {
        const itemId = Number(itemEl.dataset.menuItemId);
        const itemDate = itemEl.dataset.menuItemDate ?? '';
        // The editor's live state, ahead of `data` until the next reload.
        const liveItems = getItemsHandlersRef.current[itemDate]?.();
        const item = (liveItems ?? editorItems(data[itemDate]?.menu ?? null)).find((i) => i.id === itemId);
        setContextTarget({
          type: 'item',
          date: itemDate,
          itemId,
          isOos: item?.is_out_of_stock ?? false,
          dishId: item?.dish_id,
        });
        return;
      }
      const dayEl = target.closest('[data-day-date]') as HTMLElement | null;
      if (dayEl) {
        const date = dayEl.dataset.dayDate ?? '';
        const dayData = data[date];
        setContextTarget({
          type: 'day',
          date,
          hasMenu: Boolean(dayData?.menu),
          menuStatus: dayData?.menu?.status ?? null,
        });
        return;
      }
      setContextTarget(null);
    },
    [canEdit, data, lasso]
  );

  const handleContextTogglePublish = useCallback(async () => {
    if (contextTarget?.type !== 'day' || !contextTarget.hasMenu) return;
    try {
      if (contextTarget.menuStatus === 'published') await menusApi.unpublish(site, contextTarget.date);
      else await menusApi.publish(site, contextTarget.date);
      onReload();
    } catch {
      /* The menu keeps its status. */
    }
  }, [site, contextTarget, onReload]);

  const handleContextToggleOos = useCallback(() => {
    if (contextTarget?.type !== 'item') return;
    updateItemHandlersRef.current[contextTarget.date]?.(contextTarget.itemId, {
      is_out_of_stock: !contextTarget.isOos,
    });
  }, [contextTarget]);

  const handleContextDeleteItem = useCallback(() => {
    if (contextTarget?.type !== 'item') return;
    removeHandlersRef.current[contextTarget.date]?.(contextTarget.itemId);
  }, [contextTarget]);

  const handleBulkRemove = useCallback(() => {
    for (const entry of selection.selection) {
      if (entry.type !== 'item') continue;
      removeHandlersRef.current[entry.date]?.(entry.itemId);
    }
    selection.clearSelection();
  }, [selection]);

  const openAddDish = useCallback(
    (categoryId: number) => {
      if (contextTarget?.type !== 'day') return;
      const { date } = contextTarget;
      setAddDishCatalog([]);
      setAddDishLoading(true);
      dishesApi
        .listAll(site, { category_ids: String(categoryId), sort: 'name' })
        .then((dishes) => setAddDishCatalog(dishes))
        .catch(() => {})
        .finally(() => setAddDishLoading(false));
      setPendingAddDish({ date, categoryId });
    },
    [site, contextTarget]
  );

  const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const serviceDaySet = new Set(serviceDays);

  const visibleDays = allDays.filter((date) => {
    const d = new Date(date + 'T12:00:00');
    const mariamDay = (d.getDay() + 6) % 7; // 0=Mon…6=Sun
    return serviceDaySet.has(mariamDay);
  });

  const selectedItems = selection.selection
    .filter((e) => e.type === 'item')
    .map((e) => {
      if (e.type !== 'item') return null;
      const dayData = data[e.date];
      return editorItems(dayData?.menu ?? null).find((i) => i.id === e.itemId) ?? null;
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);

  const selectedItemCount = selection.selection.filter((e) => e.type === 'item').length;
  const isBulkContext =
    contextTarget?.type === 'item' &&
    selectedItemCount > 1 &&
    selection.selection.some((e) => e.type === 'item' && e.itemId === contextTarget.itemId);

  const contextItem =
    contextTarget?.type === 'item'
      ? (
          getItemsHandlersRef.current[contextTarget.date]?.() ??
          editorItems(data[contextTarget.date]?.menu ?? null)
        ).find((i) => i.id === contextTarget.itemId)
      : undefined;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {canEdit && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 transition-colors',
              selection.selectionMode && selection.selectedItemCount > 0
                ? 'bg-primary/5'
                : 'bg-card'
            )}
          >
            {selection.selectionMode && selection.selectedItemCount > 0 ? (
              <SelectionToolbar
                selection={selection}
                selectedItems={selectedItems}
                onMarkOos={handleBulkMarkOos}
                onMarkInStock={handleBulkMarkInStock}
                onRemove={handleBulkRemove}
                onClearAndReload={() => {
                  selection.clearSelection();
                  onReload();
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={selection.toggleSelectionMode}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                    selection.selectionMode
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  Mode sélection
                </button>
                <div className="flex-1" />
                {anyDirty && (
                  <>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {dirtyDates.size === 1
                        ? '1 jour modifié'
                        : `${dirtyDates.size} jours modifiés`}
                    </span>
                    <button
                      type="button"
                      onClick={handleResetAll}
                      disabled={isSavingAll}
                      className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Annuler</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAll}
                      disabled={isSavingAll}
                      className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isSavingAll ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={columnsContainerRef}
              className="relative flex flex-1 select-none overflow-auto border-t border-border pb-24 sidebar:pb-0"
              {...lasso.handlers}
              onContextMenu={handleContextMenu}
            >
              {lasso.rect && (
                <div
                  className="pointer-events-none absolute z-30 rounded border border-primary bg-primary/10"
                  style={{
                    left: Math.min(lasso.rect.x1, lasso.rect.x2),
                    top: Math.min(lasso.rect.y1, lasso.rect.y2),
                    width: Math.abs(lasso.rect.x2 - lasso.rect.x1),
                    height: Math.abs(lasso.rect.y2 - lasso.rect.y1),
                  }}
                />
              )}
              {visibleDays.map((date) => (
                <WeekDayColumn
                  key={date}
                  date={date}
                  isToday={date === today}
                  dayData={data[date]}
                  canEdit={canEdit}
                  categories={categories}
                  selection={selection}
                  onStartOnboarding={(d) => onStartOnboarding?.(d)}
                  onReload={onReload}
                  onDirtyChange={handleColumnDirtyChange}
                  onRegisterDrop={(fn) => {
                    dropHandlersRef.current[date] = fn;
                  }}
                  onRegisterRemove={(fn) => {
                    removeHandlersRef.current[date] = fn;
                  }}
                  onRegisterUpdateItem={(fn) => {
                    updateItemHandlersRef.current[date] = fn;
                  }}
                  onRegisterGetItems={(fn) => {
                    getItemsHandlersRef.current[date] = fn;
                  }}
                  onEditEvent={onEditEvent}
                />
              ))}
              {visibleDays.length === 0 && (
                <div className="flex flex-1 items-center justify-center p-8">
                  <p className="text-sm text-muted-foreground">Aucun jour de service configuré.</p>
                </div>
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-52">
            {contextTarget?.type === 'day' && (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un plat dans…
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-44">
                    {categories
                      .filter((c) => !c.parent_id)
                      .map((cat) => (
                        <ContextMenuItem
                          key={cat.id}
                          onClick={() => runAfterMenuClose(() => openAddDish(cat.id))}
                        >
                          {cat.label}
                        </ContextMenuItem>
                      ))}
                    {categories
                      .flatMap((c) => c.subcategories ?? [])
                      .map((sub) => (
                        <ContextMenuItem
                          key={sub.id}
                          className="pl-6 text-muted-foreground"
                          onClick={() => runAfterMenuClose(() => openAddDish(sub.id))}
                        >
                          {sub.label}
                        </ContextMenuItem>
                      ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                {contextTarget.hasMenu && (
                  <ContextMenuItem className="gap-2" onClick={handleContextTogglePublish}>
                    {contextTarget.menuStatus === 'published' ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Passer en brouillon
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Publier
                      </>
                    )}
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="gap-2"
                  onClick={() => runAfterMenuClose(() => setContextImportDate(contextTarget.date))}
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Importer depuis…
                </ContextMenuItem>
                <ContextMenuItem
                  className="gap-2"
                  onClick={() =>
                    runAfterMenuClose(() => {
                      const items = editorItems(data[contextTarget.date]?.menu ?? null);
                      setContextDupeItems(items);
                    })
                  }
                >
                  <Copy className="h-3.5 w-3.5" />
                  Dupliquer vers…
                </ContextMenuItem>
                {contextTarget.hasMenu && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="gap-2 text-destructive focus:text-destructive"
                      onClick={() =>
                        runAfterMenuClose(() =>
                          setDeleteMenuTarget({ date: contextTarget.date })
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer ce menu
                    </ContextMenuItem>
                  </>
                )}
              </>
            )}
            {contextTarget?.type === 'item' &&
              (isBulkContext ? (
                <>
                  <ContextMenuItem className="gap-2" onClick={handleBulkMarkOos}>
                    <PackageX className="h-3.5 w-3.5" />
                    Marquer tout épuisé
                  </ContextMenuItem>
                  <ContextMenuItem className="gap-2" onClick={handleBulkMarkInStock}>
                    <Package className="h-3.5 w-3.5" />
                    Tout remettre en stock
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2"
                    onClick={() => runAfterMenuClose(() => setContextDupeItems(selectedItems))}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Dupliquer
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={handleBulkRemove}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Tout retirer du menu ({selectedItemCount})
                  </ContextMenuItem>
                </>
              ) : (
                <>
                  <ContextMenuItem className="gap-2" onClick={handleContextToggleOos}>
                    <PackageX className="h-3.5 w-3.5" />
                    {contextTarget.isOos ? 'Remettre en stock' : 'Marquer épuisé'}
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2"
                    onClick={() =>
                      runAfterMenuClose(() => setContextDupeItems(contextItem ? [contextItem] : []))
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Dupliquer
                  </ContextMenuItem>
                  {contextTarget.dishId && (
                    <ContextMenuItem
                      className="gap-2"
                      onClick={() =>
                        runAfterMenuClose(() =>
                          navigate(`/admin/catalogue/${contextTarget.dishId}`)
                        )
                      }
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Voir dans le catalogue
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={handleContextDeleteItem}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer du menu
                  </ContextMenuItem>
                </>
              ))}
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragItem && (
          <div className={cn('relative', isCopyMode && 'cursor-copy')}>
            <WeekMenuItemBoxGhost item={activeDragItem.item} color={activeDragItem.color} />
            {multiDragItems.length > 1 && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-sm">
                {multiDragItems.length}
              </span>
            )}
            {isCopyMode && (
              <span className="absolute -left-2 -top-2 flex items-center gap-0.5 rounded-full bg-emerald-500 py-0.5 pl-1 pr-1.5 text-[10px] font-bold text-white shadow-sm">
                <Plus className="h-2.5 w-2.5" />
                Copie
              </span>
            )}
          </div>
        )}
      </DragOverlay>

      {pendingAddDish && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingAddDish(null);
          }}
        >
          <DialogContent className="overflow-hidden p-0 sm:max-w-sm">
            <DialogHeader className="px-4 pb-2 pt-4">
              <DialogTitle className="text-sm">Ajouter un plat</DialogTitle>
            </DialogHeader>
            <Command>
              <CommandInput placeholder="Rechercher…" autoFocus />
              <CommandList className="max-h-60">
                {addDishLoading ? (
                  <CommandEmpty>Chargement…</CommandEmpty>
                ) : (
                  <CommandEmpty>Aucun plat dans cette catégorie.</CommandEmpty>
                )}
                {!addDishLoading && addDishCatalog.length > 0 && (
                  <CommandGroup>
                    {addDishCatalog.map((dish) => (
                      <CommandItem
                        key={dish.id}
                        value={dish.name}
                        onSelect={() => {
                          dropHandlersRef.current[pendingAddDish.date]?.(
                            pendingAddDish.categoryId,
                            dish.id,
                            dish
                          );
                          setPendingAddDish(null);
                          onReload();
                        }}
                      >
                        {dish.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      )}

      <MenuCopyPopover
        direction="import"
        open={contextImportDate !== null}
        onOpenChange={(o) => {
          if (!o) setContextImportDate(null);
        }}
        anchorPoint={dupeAnchor}
        targetDate={contextImportDate ?? undefined}
        onDone={() => {
          setContextImportDate(null);
          onReload();
        }}
      />

      <AlertDialog
        open={deleteMenuTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteMenuTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce menu ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le menu du {deleteMenuTarget?.date} et tous ses plats seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMenu}
              disabled={isDeletingMenu}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingMenu ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MenuCopyPopover
        direction="export"
        open={contextDupeItems !== null}
        onOpenChange={(o) => {
          if (!o) setContextDupeItems(null);
        }}
        anchorPoint={dupeAnchor}
        sourceItems={contextDupeItems ?? []}
        onDone={() => {
          setContextDupeItems(null);
          onReload();
        }}
      />
    </DndContext>
  );
}
