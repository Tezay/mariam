/**
 * Sorting and selection rules, shared by the toolbar, the table headers and the
 * selection bar so the three controls never disagree.
 */
export const MIN_COMPARE = 2;
export const MAX_COMPARE = 3;

export function canCompare(count: number): boolean {
  return count >= MIN_COMPARE && count <= MAX_COMPARE;
}

/** A name reads A to Z by default; a measure reads best-first. */
export function isAscending(sort: string, order: 'asc' | 'desc' | null): boolean {
  return order === 'asc' || (order === null && sort === 'name');
}

/** Picking the active criterion again flips it; another one starts at its own default. */
export function nextSort(
  current: { sort: string; order: 'asc' | 'desc' | null },
  picked: string
): { sort?: string; order: 'asc' | 'desc' | null } {
  if (current.sort !== picked) return { sort: picked, order: null };
  return { order: isAscending(current.sort, current.order) ? 'desc' : 'asc' };
}
