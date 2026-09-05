import type { MenuDayStatus } from '@/lib/api';
import { MENU_STATUSES } from '@/lib/menu-status';
import { cn } from '@/lib/utils';

export function MenuStatusBadge({ status }: { status: MenuDayStatus }) {
  const { label, dot, text } = MENU_STATUSES[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <span className={text ?? 'text-foreground'}>{label}</span>
    </span>
  );
}
