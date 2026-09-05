import type { MenuDayStatus } from '@/lib/api';

interface MenuStatusDefinition {
  label: string;
  dot: string;
  text?: string;
}

export const MENU_STATUSES: Record<MenuDayStatus, MenuStatusDefinition> = {
  published: { label: 'Publié', dot: 'bg-emerald-500' },
  draft: { label: 'Brouillon', dot: 'bg-[#9E87D1]' },
  missing: { label: 'Non publié', dot: 'bg-red-400', text: 'text-red-600 dark:text-red-400' },
  closed: { label: 'Fermé', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
};

// Worst first, so sorting a column on this surfaces the sites to act on.
export const MENU_STATUS_RANK: Record<MenuDayStatus, number> = {
  missing: 0,
  draft: 1,
  published: 2,
  closed: 3,
};

export function menuStatusLabel(status: MenuDayStatus): string {
  return MENU_STATUSES[status].label;
}
