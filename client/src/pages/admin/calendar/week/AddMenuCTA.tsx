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
        'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
        primary
          ? 'bg-primary/8 text-primary hover:bg-primary/15'
          : 'text-foreground hover:bg-muted',
        className
      )}
      {...props}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', primary ? 'text-primary' : 'text-muted-foreground')}
      />
      <div className="min-w-0">
        <p
          className={cn(
            'text-xs font-medium leading-tight',
            primary ? 'text-primary' : 'text-foreground'
          )}
        >
          {label}
        </p>
        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{desc}</p>
      </div>
    </button>
  )
);
OptionButton.displayName = 'OptionButton';

export function AddMenuCTA({
  date,
  restaurantId,
  onStartOnboarding,
  onImportCsv,
  onImported,
}: AddMenuCTAProps) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-card py-6 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
      >
        <Plus className="h-5 w-5" />
        <span className="text-xs font-medium">Créer un menu</span>
      </button>
    );
  }

  const wrap = (children: ReactNode) => (
    <div className="space-y-1 rounded-xl border border-border bg-card p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ajouter un menu
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-muted-foreground/50 hover:text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
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
        onClick={() => {
          setExpanded(false);
          onStartOnboarding();
        }}
      />
      <MenuCopyPopover
        direction="import"
        targetDate={date}
        restaurantId={restaurantId}
        onDone={() => {
          setExpanded(false);
          onImported();
        }}
        align="start"
      >
        <OptionButton icon={Copy} label="Importer depuis un jour" desc="Copier un menu existant" />
      </MenuCopyPopover>
      <OptionButton
        icon={Table2}
        label="Importer un fichier CSV"
        desc="Charger depuis un fichier"
        onClick={() => {
          setExpanded(false);
          onImportCsv();
        }}
      />
    </>
  );
}
