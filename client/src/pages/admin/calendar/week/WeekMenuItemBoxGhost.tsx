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
            className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 shadow-lg rotate-1 opacity-95 pointer-events-none"
            style={{
                backgroundColor: color.bg,
                borderBottom: `3px solid ${color.border}`,
                width: '160px',
            }}
        >
            <p className="flex-1 min-w-0 text-xs font-semibold truncate" style={{ color: color.label }}>
                {name || <span className="opacity-40 italic">Plat sans nom</span>}
            </p>
        </div>
    );
}
