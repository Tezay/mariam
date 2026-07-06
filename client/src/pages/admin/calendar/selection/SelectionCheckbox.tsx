import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroupState } from './useSelection';

interface SelectionCheckboxProps {
    /** 'all' = coché, 'some' = indéterminé, 'none' = vide. Ou un booléen pour un item. */
    state: GroupState | boolean;
    onToggle: () => void;
    /** Taille de la boîte (défaut 16px) */
    size?: 'sm' | 'md';
    className?: string;
    'aria-label'?: string;
}

export function SelectionCheckbox({ state, onToggle, size = 'md', className, ...aria }: SelectionCheckboxProps) {
    const value: GroupState = typeof state === 'boolean' ? (state ? 'all' : 'none') : state;
    const active = value !== 'none';
    const box = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
    const icon = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={value === 'some' ? 'mixed' : value === 'all'}
            aria-label={aria['aria-label']}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={cn(
                'shrink-0 rounded-[5px] border-2 flex items-center justify-center transition-colors',
                box,
                active
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/40 hover:border-primary/60 bg-transparent',
                className,
            )}
        >
            {value === 'all' && <Check className={cn(icon)} strokeWidth={3} />}
            {value === 'some' && <Minus className={cn(icon)} strokeWidth={3} />}
        </button>
    );
}
