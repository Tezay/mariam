import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import type { MenuItem } from '@/lib/api';
import type { CategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';

interface WeekMenuItemBoxProps {
    item: MenuItem;
    color: CategoryColor;
    canEdit: boolean;
    selectionMode: boolean;
    isSelected: boolean;
    date: string;
    onRemove: () => void;
    onToggleSelect: () => void;
}

export function WeekMenuItemBox({
    item,
    color,
    canEdit,
    selectionMode,
    isSelected,
    date,
    onRemove,
    onToggleSelect,
}: WeekMenuItemBoxProps) {
    const name = item.dish?.name ?? '';
    const isOos = item.is_out_of_stock ?? false;

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `week-drag-item-${item.id}`,
        data: { dishId: item.dish_id, categoryId: item.category_id, date, item, color },
        disabled: !canEdit || !item.id,
    });

    // Empêche le clic de sélection de se déclencher après un drag
    const wasDragged = useRef(false);
    useEffect(() => {
        if (isDragging) wasDragged.current = true;
    }, [isDragging]);

    const { onPointerDown, ...restListeners } = listeners ?? {};

    const handleClick = () => {
        if (wasDragged.current) {
            wasDragged.current = false;
            return;
        }
        if (selectionMode) onToggleSelect();
    };

    return (
        <div
            ref={setNodeRef}
            {...restListeners}
            {...attributes}
            onPointerDown={(e) => {
                wasDragged.current = false;
                onPointerDown?.(e);
            }}
            onClick={handleClick}
            data-menu-item-id={item.id}
            data-menu-item-date={date}
            data-menu-item-category-id={item.category_id}
            className={cn(
                'group relative flex items-center gap-1.5 rounded-xl px-2 py-1.5 touch-none',
                isSelected && 'ring-2 ring-primary ring-inset',
                isDragging && 'opacity-30',
                selectionMode && 'cursor-pointer',
                canEdit && !selectionMode && 'cursor-grab active:cursor-grabbing',
            )}
            style={{
                backgroundColor: color.bg,
                borderBottom: `3px solid ${color.border}`,
            }}
        >
            {/* Name */}
            <p className={cn("flex-1 min-w-0 text-xs font-semibold truncate transition-all", isOos && "line-through opacity-40")} style={{ color: color.label }} title={name || undefined}>
                {name || <span className="opacity-40 italic">Plat sans nom</span>}
            </p>

            {/* OOS badge */}
            {isOos && (
                <span
                    className="text-[9px] font-semibold px-1 rounded-full shrink-0"
                    style={{ backgroundColor: '#FED7AA', color: '#9A3412' }}
                >
                    Épuisé
                </span>
            )}

            {/* Remove button */}
            {canEdit && !selectionMode && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-lg shrink-0 hover:bg-black/10"
                >
                    <X className="w-3 h-3" style={{ color: color.label }} />
                </button>
            )}
        </div>
    );
}
