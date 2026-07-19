import { useState, useCallback } from 'react';
import type { MenuItem } from '@/lib/api';

export interface SelectionEntry {
  type: 'item';
  itemId: number;
  date: string;
  categoryId: number;
}

export type GroupState = 'none' | 'some' | 'all';

function key(date: string, itemId: number): string {
  return `${date}:${itemId}`;
}

export interface UseSelectionReturn {
  selectionMode: boolean;
  selection: SelectionEntry[];
  toggleSelectionMode(): void;
  toggleItem(entry: SelectionEntry): void;
  isItemSelected(itemId: number, date: string): boolean;
  getGroupState(date: string, items: MenuItem[]): GroupState;
  toggleGroup(date: string, items: MenuItem[]): void;
  selectMultiple(entries: SelectionEntry[]): void;
  clearSelection(): void;
  selectedItemCount: number;
}

export function useSelection(): UseSelectionReturn {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<SelectionEntry[]>([]);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((m) => {
      if (m) setSelection([]);
      return !m;
    });
  }, []);

  const toggleItem = useCallback((entry: SelectionEntry) => {
    setSelection((prev) => {
      const exists = prev.some((e) => e.date === entry.date && e.itemId === entry.itemId);
      return exists
        ? prev.filter((e) => !(e.date === entry.date && e.itemId === entry.itemId))
        : [...prev, entry];
    });
  }, []);

  const isItemSelected = useCallback(
    (itemId: number, date: string) => selection.some((e) => e.date === date && e.itemId === itemId),
    [selection]
  );

  const getGroupState = useCallback(
    (date: string, items: MenuItem[]): GroupState => {
      const withId = items.filter((i) => i.id != null);
      if (withId.length === 0) return 'none';
      const selected = withId.filter((it) =>
        selection.some((e) => e.date === date && e.itemId === it.id)
      ).length;
      if (selected === 0) return 'none';
      return selected === withId.length ? 'all' : 'some';
    },
    [selection]
  );

  const toggleGroup = useCallback((date: string, items: MenuItem[]) => {
    const entries: SelectionEntry[] = items
      .filter((i) => i.id != null)
      .map((i) => ({ type: 'item', itemId: i.id!, date, categoryId: i.category_id }));
    setSelection((prev) => {
      const allSelected =
        entries.length > 0 &&
        entries.every((en) => prev.some((e) => e.date === en.date && e.itemId === en.itemId));
      if (allSelected) {
        const toRemove = new Set(entries.map((e) => key(e.date, e.itemId)));
        return prev.filter((e) => !toRemove.has(key(e.date, e.itemId)));
      }
      const existing = new Set(prev.map((e) => key(e.date, e.itemId)));
      return [...prev, ...entries.filter((e) => !existing.has(key(e.date, e.itemId)))];
    });
  }, []);

  const clearSelection = useCallback(() => setSelection([]), []);

  const selectMultiple = useCallback((entries: SelectionEntry[]) => {
    setSelectionMode(true);
    setSelection(entries);
  }, []);

  return {
    selectionMode,
    selection,
    toggleSelectionMode,
    toggleItem,
    isItemSelected,
    getGroupState,
    toggleGroup,
    selectMultiple,
    clearSelection,
    selectedItemCount: selection.length,
  };
}
