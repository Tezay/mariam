import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CsvStepIndicatorProps<T extends string> {
    steps: readonly { id: T; label: string }[];
    current: T;
}

/** Bandeau d'étapes numérotées pour les wizards d'import CSV (menu, catalogue). */
export function CsvStepIndicator<T extends string>({ steps, current }: CsvStepIndicatorProps<T>) {
    const currentIndex = steps.findIndex(s => s.id === current);
    return (
        <div className="flex items-center gap-2 px-1 py-2">
            {steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                    <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                        i === currentIndex ? 'bg-primary text-white'
                            : i < currentIndex ? 'bg-primary/30 text-primary'
                            : 'bg-muted text-muted-foreground',
                    )}>
                        {i + 1}
                    </div>
                    <span className={cn('text-xs', i === currentIndex ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                        {s.label}
                    </span>
                    {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
            ))}
        </div>
    );
}
