import { useState } from 'react';
import { menusApi } from '@/lib/api';
import type { MenuItem } from '@/lib/api';
import { notify } from '@/lib/toast';

export type ConflictMode = 'replace' | 'ignore' | 'add';
export type CopyDirection = 'export' | 'import';

export const CONFLICT_OPTIONS: { value: ConflictMode; label: string; desc: string }[] = [
  { value: 'add', label: 'Ajouter', desc: 'Ajoute aux items existants' },
  { value: 'replace', label: 'Remplacer', desc: 'Écrase les catégories concernées' },
  { value: 'ignore', label: 'Ignorer', desc: 'Saute les jours déjà remplis' },
];

/** Retire les champs propres à un item persisté pour le ré-enregistrer ailleurs. */
function stripItem({ id: _id, dish: _dish, menu_id: _menuId, ...rest }: MenuItem) {
  return rest;
}

/**
 * Applique des plats à un jour cible selon le mode de conflit.
 * Retourne true si le menu a été écrit, false s'il a été ignoré.
 */
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
    // N'écrase que les catégories présentes dans la source, garde les autres
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
  /** export : plats à copier vers les dates choisies. */
  sourceItems?: MenuItem[];
  /** import : jour de destination qui reçoit les plats des dates choisies. */
  targetDate?: string;
}

/**
 * Moteur de copie de menu bidirectionnel.
 * - export : `dates` = jours cibles, on y applique `sourceItems`.
 * - import : `dates` = jours sources, on fusionne leurs plats dans `targetDate`.
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
        // import : fusionne les plats de tous les jours sources choisis
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
