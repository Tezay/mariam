import { useState, forwardRef } from 'react';
import type { ComponentType, ComponentPropsWithoutRef, ReactNode } from 'react';
import { Plus, CalendarPlus, Copy, Table2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuCopyPopover } from '../selection/MenuCopyPopover';

interface AddMenuCTAProps {
    date: string;
    restaurantId: number | undefined;
    onStartOnboarding: () => void;
    onImportCsv: () => void;
    onImported: () => void;
}

interface OptionButtonProps extends ComponentPropsWithoutRef<'button'> {
    icon: ComponentType<{ className?: string }>;
    label: string;
    desc: string;
    primary?: boolean;
}

// forwardRef requis : utilisé comme enfant de <PopoverTrigger asChild>, qui
// clone l'élément et lui transmet une ref + ses handlers (ouverture du popover).
const OptionButton = forwardRef<HTMLButtonElement, OptionButtonProps>(
    ({ icon: Icon, label, desc, primary, className, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            className={cn(
                'w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors',
                primary ? 'bg-primary/8 hover:bg-primary/15 text-primary' : 'hover:bg-muted text-foreground',
                className,
            )}
            {...props}
        >
            <Icon className={cn('w-4 h-4 shrink-0', primary ? 'text-primary' : 'text-muted-foreground')} />
            <div className="min-w-0">
                <p className={cn('text-xs font-medium leading-tight', primary ? 'text-primary' : 'text-foreground')}>{label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
            </div>
        </button>
    ),
);
OptionButton.displayName = 'OptionButton';

export function AddMenuCTA({ date, restaurantId, onStartOnboarding, onImportCsv, onImported }: AddMenuCTAProps) {
    const [expanded, setExpanded] = useState(false);

    if (!expanded) {
        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
            >
                <Plus className="w-5 h-5" />
                <span className="text-xs font-medium">Créer un menu</span>
            </button>
        );
    }

    const wrap = (children: ReactNode) => (
        <div className="rounded-xl border border-border bg-card p-2 space-y-1">
            <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ajouter un menu
                </span>
                <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="text-muted-foreground/50 hover:text-muted-foreground"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            {children}
        </div>
    );

    return wrap(
        <>
            <OptionButton
                icon={CalendarPlus}
                label="Créer via l'assistant"
                desc="Saisir catégorie par catégorie"
                primary
                onClick={() => { setExpanded(false); onStartOnboarding(); }}
            />
            <MenuCopyPopover
                direction="import"
                targetDate={date}
                restaurantId={restaurantId}
                onDone={() => { setExpanded(false); onImported(); }}
                align="start"
            >
                <OptionButton
                    icon={Copy}
                    label="Importer depuis un jour"
                    desc="Copier un menu existant"
                />
            </MenuCopyPopover>
            <OptionButton
                icon={Table2}
                label="Importer un fichier CSV"
                desc="Charger depuis un fichier"
                onClick={() => { setExpanded(false); onImportCsv(); }}
            />
        </>,
    );
}
