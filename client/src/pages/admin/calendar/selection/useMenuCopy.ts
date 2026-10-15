import { useState } from 'react';
import { menusApi } from '@/lib/api/menus';
import type { MenuItem } from '@/lib/api/menus';
import { notify } from '@/lib/toast';

export type ConflictMode = 'replace' | 'ignore' | 'add';
export type CopyDirection = 'export' | 'import';

export const CONFLICT_OPTIONS: { value: ConflictMode; label: string; desc: string }[] = [
  { value: 'add', label: 'Ajouter', desc: 'Ajoute aux items existants' },
  { value: 'replace', label: 'Remplacer', desc: 'Écrase les catégories concernées' },
  { value: 'ignore', label: 'Ignorer', desc: 'Saute les jours déjà remplis' },
];

/** Without the fields of a saved item, so that it can be saved elsewhere. */
function stripItem({ id: _id, dish: _dish, menu_id: _menuId, ...rest }: MenuItem) {
  return rest;
}

/** True when the menu was written, false when it was left alone. */
async function applyItemsToDate(
  date: string,
  sourceItems: MenuItem[],
  mode: ConflictMode,
  restaurantId: number | undefined
): Promise<boolean> {
  const existing = await menusApi.getByDate(date, restaurantId).catch(() => null);
  if (mode === 'ignore' && existing) return false;

  const base = existing ? existing.items.map(stripItem) : [];
  const clean = sourceItems.map(stripItem);

  let items: ReturnType<typeof stripItem>[];
  if (mode === 'replace') {
    // Only the categories the source brings are replaced.
    const cats = new Set(clean.map((i) => i.category_id));
    items = [...base.filter((i) => !cats.has(i.category_id)), ...clean];
  } else if (mode === 'add') {
    items = [...base, ...clean];
  } else {
    items = clean;
  }

  await menusApi.save(date, items, restaurantId);
  return true;
}

interface UseMenuCopyParams {
  direction: CopyDirection;
  restaurantId: number | undefined;
  onDone: () => void;
  /** Export: the dishes to copy to the chosen dates. */
  sourceItems?: MenuItem[];
  /** Import: the day that receives the dishes of the chosen dates. */
  targetDate?: string;
}

/**
 * Export applies `sourceItems` to each of `dates`; import merges the dishes of
 * `dates` into `targetDate`.
 */
export function useMenuCopy({
  direction,
  restaurantId,
  onDone,
  sourceItems = [],
  targetDate,
}: UseMenuCopyParams) {
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [conflictMode, setConflictMode] = useState<ConflictMode>('add');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDates(new Set());
    setError(null);
  };

  const run = async () => {
    if (dates.size === 0) {
      setError(
        direction === 'export'
          ? 'Sélectionnez au moins une date cible.'
          : 'Sélectionnez au moins un jour source.'
      );
      return;
    }
    setIsSaving(true);
    setError(null);

    try {
      if (direction === 'export') {
        let copied = 0;
        let skipped = 0;
        for (const date of dates) {
          if (await applyItemsToDate(date, sourceItems, conflictMode, restaurantId)) copied++;
          else skipped++;
        }
        if (copied && skipped) {
          notify.success(
            `Menu copié sur ${copied} jour${copied > 1 ? 's' : ''}, ${skipped} ignoré${skipped > 1 ? 's' : ''}`
          );
        } else if (copied) {
          notify.success(`Menu copié sur ${copied} jour${copied > 1 ? 's' : ''}`);
        } else {
          notify.info(
            `Aucun menu copié (${skipped} jour${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''})`
          );
        }
      } else {
        const merged: MenuItem[] = [];
        for (const date of dates) {
          const menu = await menusApi.getByDate(date, restaurantId).catch(() => null);
          if (menu?.items) merged.push(...menu.items);
        }
        if (merged.length === 0) {
          setError('Aucun plat trouvé sur les dates choisies.');
          setIsSaving(false);
          return;
        }
        await applyItemsToDate(targetDate!, merged, conflictMode, restaurantId);
        notify.success('Menu importé');
      }

      reset();
      onDone();
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  return { dates, setDates, conflictMode, setConflictMode, isSaving, error, run, reset };
}
