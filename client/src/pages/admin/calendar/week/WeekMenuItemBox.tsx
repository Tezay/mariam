import { useRef } from 'react';
import { X } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import type { CategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';

interface WeekMenuItemBoxProps {
    item: MenuItem;
    color: CategoryColor;
    canEdit: boolean;
    selectionMode: boolean;
    isSelected: boolean;
    onNameChange: (name: string) => void;
    onRemove: () => void;
    onToggleSelect: () => void;
}

export function WeekMenuItemBox({
    item,
    color,
    canEdit,
    selectionMode,
    isSelected,
    onNameChange,
    onRemove,
    onToggleSelect,
}: WeekMenuItemBoxProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div
            className={cn(
                'group relative flex items-center gap-1.5 rounded-xl px-2 py-1.5',
                isSelected && 'ring-2 ring-primary ring-inset',
            )}
            style={{
                backgroundColor: color.bg,
                borderBottom: `3px solid ${color.border}`,
            }}
        >
            {/* Selection checkbox */}
            {selectionMode && (
                <button
                    type="button"
                    onClick={onToggleSelect}
                    className={cn(
                        'w-3.5 h-3.5 rounded border-2 shrink-0',
                        isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                    )}
                />
            )}

            {/* Name (editable or static) */}
            <div className="flex-1 min-w-0" onClick={() => inputRef.current?.focus()}>
                {canEdit ? (
                    <input
                        ref={inputRef}
                        value={item.name}
                        onChange={e => onNameChange(e.target.value)}
                        className="w-full bg-transparent border-none outline-none text-xs font-semibold truncate"
                        style={{ color: color.label }}
                        placeholder="Nom du plat"
                    />
                ) : (
                    <p className="text-xs font-semibold truncate" style={{ color: color.label }}>{item.name}</p>
                )}
            </div>

            {/* OOS badge */}
            {item.is_out_of_stock && (
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
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded shrink-0 hover:bg-black/10"
                >
                    <X className="w-3 h-3" style={{ color: color.label }} />
                </button>
            )}
        </div>
    );
}
