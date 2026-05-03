import { useState, useCallback } from 'react';
import type { MenuItem } from '@/lib/api';

export type SelectionEntry =
    | { type: 'item'; itemId: number; date: string; categoryId: number }
    | { type: 'category'; categoryId: number; date: string }
    | { type: 'day'; date: string };

function entryKey(e: SelectionEntry): string {
    if (e.type === 'item') return `item:${e.date}:${e.itemId}`;
    if (e.type === 'category') return `cat:${e.date}:${e.categoryId}`;
    return `day:${e.date}`;
}

export interface UseSelectionReturn {
    selectionMode: boolean;
    selection: SelectionEntry[];
    toggleSelectionMode(): void;
    toggleItem(entry: SelectionEntry): void;
    isSelected(entry: SelectionEntry): boolean;
    selectCategory(categoryId: number, date: string, items: MenuItem[]): void;
    selectDay(date: string, allItems: MenuItem[]): void;
    clearSelection(): void;
    selectedItemCount: number;
}

export function useSelection(): UseSelectionReturn {
    const [selectionMode, setSelectionMode] = useState(false);
    const [selection, setSelection] = useState<SelectionEntry[]>([]);

    const toggleSelectionMode = useCallback(() => {
        setSelectionMode(m => {
            if (m) setSelection([]);
            return !m;
        });
    }, []);

    const toggleItem = useCallback((entry: SelectionEntry) => {
        const key = entryKey(entry);
        setSelection(prev => {
            const exists = prev.some(e => entryKey(e) === key);
            return exists ? prev.filter(e => entryKey(e) !== key) : [...prev, entry];
        });
    }, []);

    const isSelected = useCallback((entry: SelectionEntry): boolean => {
        const key = entryKey(entry);
        return selection.some(e => entryKey(e) === key);
    }, [selection]);

    const selectCategory = useCallback((categoryId: number, date: string, items: MenuItem[]) => {
        const catEntry: SelectionEntry = { type: 'category', categoryId, date };
        const itemEntries: SelectionEntry[] = items.map(item => ({
            type: 'item',
            itemId: item.id!,
            date,
            categoryId,
        }));
        setSelection(prev => {
            const catKey = entryKey(catEntry);
            const alreadySelected = prev.some(e => entryKey(e) === catKey);
            if (alreadySelected) {
                const catItemKeys = new Set(itemEntries.map(entryKey));
                return prev.filter(e => entryKey(e) !== catKey && !catItemKeys.has(entryKey(e)));
            }
            const existingKeys = new Set(prev.map(entryKey));
            const newEntries = [catEntry, ...itemEntries].filter(e => !existingKeys.has(entryKey(e)));
            return [...prev, ...newEntries];
        });
    }, []);

    const selectDay = useCallback((date: string, allItems: MenuItem[]) => {
        const dayEntry: SelectionEntry = { type: 'day', date };
        const itemEntries: SelectionEntry[] = allItems.map(item => ({
            type: 'item',
            itemId: item.id!,
            date,
            categoryId: item.category_id,
        }));
        setSelection(prev => {
            const dayKey = entryKey(dayEntry);
            const alreadySelected = prev.some(e => entryKey(e) === dayKey);
            if (alreadySelected) {
                const allKeys = new Set([dayEntry, ...itemEntries].map(entryKey));
                return prev.filter(e => !allKeys.has(entryKey(e)));
            }
            const existingKeys = new Set(prev.map(entryKey));
            const newEntries = [dayEntry, ...itemEntries].filter(e => !existingKeys.has(entryKey(e)));
            return [...prev, ...newEntries];
        });
    }, []);

    const clearSelection = useCallback(() => setSelection([]), []);

    const selectedItemCount = selection.filter(e => e.type === 'item').length;

    return {
        selectionMode,
        selection,
        toggleSelectionMode,
        toggleItem,
        isSelected,
        selectCategory,
        selectDay,
        clearSelection,
        selectedItemCount,
    };
}
