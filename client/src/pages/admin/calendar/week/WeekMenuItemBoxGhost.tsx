import type { MenuItem } from '@/lib/api';
import type { CategoryColor } from '@/lib/category-colors';

interface WeekMenuItemBoxGhostProps {
  item: MenuItem;
  color: CategoryColor;
}

export function WeekMenuItemBoxGhost({ item, color }: WeekMenuItemBoxGhostProps) {
  const name = item.dish?.name ?? '';
  return (
    <div
      className="pointer-events-none flex rotate-1 items-center gap-1.5 rounded-xl px-2 py-1.5 opacity-95 shadow-lg"
      style={{
        backgroundColor: color.bg,
        borderBottom: `3px solid ${color.border}`,
        width: '160px',
      }}
    >
      <p className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: color.label }}>
        {name || <span className="italic opacity-40">Plat sans nom</span>}
      </p>
    </div>
  );
}
