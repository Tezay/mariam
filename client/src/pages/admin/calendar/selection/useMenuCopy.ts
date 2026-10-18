import { useState } from 'react';
import { useSiteRef } from '@/contexts/SiteContext';
import { menusApi, type MenuItemInput } from '@/lib/api/menus';
import type { SiteRef } from '@/lib/api/sites';
import { editorItems, type EditorItem } from '@/pages/admin/calendar/day/useMenuEditor';
import { notify } from '@/lib/toast';

export type ConflictMode = 'replace' | 'ignore' | 'add';
export type CopyDirection = 'export' | 'import';

export const CONFLICT_OPTIONS: { value: ConflictMode; label: string; desc: string }[] = [
  { value: 'add', label: 'Ajouter', desc: 'Ajoute aux items existants' },
  { value: 'replace', label: 'Remplacer', desc: 'Écrase les catégories concernées' },
  { value: 'ignore', label: 'Ignorer', desc: 'Saute les jours déjà remplis' },
];

/** Without the id of a saved item, so that it can be saved elsewhere. */
function asNewItem({ category_id, dish_id, order, is_out_of_stock }: EditorItem): MenuItemInput {
  return { category_id, dish_id, order, is_out_of_stock };
}

/** True when the menu was written, false when it was left alone. */
async function applyItemsToDate(
  site: SiteRef,
  date: string,
  sourceItems: EditorItem[],
  mode: ConflictMode
): Promise<boolean> {
  const existing = await menusApi.get(site, date);
  if (mode === 'ignore' && existing) return false;

  const base = editorItems(existing).map(asNewItem);
  const clean = sourceItems.map(asNewItem);

  let items: MenuItemInput[];
  if (mode === 'replace') {
    // Only the categories the source brings are replaced.
    const cats = new Set(clean.map((i) => i.category_id));
    items = [...base.filter((i) => !cats.has(i.category_id)), ...clean];
  } else if (mode === 'add') {
    items = [...base, ...clean];
  } else {
    items = clean;
  }

  await menusApi.put(site, date, items, existing?.chef_note ?? null);
  return true;
}

interface UseMenuCopyParams {
  direction: CopyDirection;
  onDone: () => void;
  /** Export: the dishes to copy to the chosen dates. */
  sourceItems?: EditorItem[];
  /** Import: the day that receives the dishes of the chosen dates. */
  targetDate?: string;
}

/**
 * Export applies `sourceItems` to each of `dates`; import merges the dishes of
 * `dates` into `targetDate`.
 */
export function useMenuCopy({
  direction,
  onDone,
  sourceItems = [],
  targetDate,
}: UseMenuCopyParams) {
  const site = useSiteRef();
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
          if (await applyItemsToDate(site, date, sourceItems, conflictMode)) copied++;
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
        const merged: EditorItem[] = [];
        for (const date of dates) {
          merged.push(...editorItems(await menusApi.get(site, date)));
        }
        if (merged.length === 0) {
          setError('Aucun plat trouvé sur les dates choisies.');
          setIsSaving(false);
          return;
        }
        await applyItemsToDate(site, targetDate!, merged, conflictMode);
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
