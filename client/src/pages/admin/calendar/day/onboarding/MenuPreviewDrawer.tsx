/**
 * Drawer mobile : aperçu du menu en construction ouvert à la demande via une
 * poignée flottante sur le bord droit (badge compteur). Masqué au breakpoint
 * `sidebar:` (le panel persistant prend le relais) et quand le clavier est ouvert.
 */
import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { UseMenuEditorReturn } from '../useMenuEditor';
import { MenuPreview } from './MenuPreview';
import type { CatGroup } from './types';

interface MenuPreviewDrawerProps {
  groups: CatGroup[];
  editor: UseMenuEditorReturn;
  dateLabel: string;
  hidden: boolean;
  flyTargetRef: (el: HTMLElement | null) => void;
}

export function MenuPreviewDrawer({
  groups,
  editor,
  dateLabel,
  hidden,
  flyTargetRef,
}: MenuPreviewDrawerProps) {
  const [open, setOpen] = useState(false);
  const count = editor.items.length;

  return (
    <div className="sidebar:hidden">
      {/* Poignée flottante — discrète, sous le header pour ne pas masquer le contenu */}
      <button
        type="button"
        ref={flyTargetRef}
        onClick={() => setOpen(true)}
        aria-label={`Voir le menu en cours (${count} plat${count > 1 ? 's' : ''})`}
        className={cn(
          'fixed right-0 top-[3.75rem] z-40 flex items-center gap-0.5 py-1.5 pl-1 pr-1.5',
          'rounded-l-xl border border-r-0 border-border/70 bg-card/90 shadow-sm backdrop-blur-sm',
          'transition-all duration-200 active:scale-[0.97]',
          hidden && 'pointer-events-none translate-x-full opacity-0'
        )}
      >
        <ChevronLeft className="h-3 w-3 text-muted-foreground/70" />
        <motion.span
          key={count}
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 0.3 }}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
        >
          {count}
        </motion.span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full max-w-[320px] flex-col p-0">
          <SheetHeader className="h-14 shrink-0 flex-row items-center justify-between space-y-0 border-b border-border px-4 text-left">
            <div className="min-w-0">
              <SheetTitle className="truncate text-sm capitalize">{dateLabel}</SheetTitle>
              <p className="text-[11px] text-muted-foreground">
                {count} plat{count > 1 ? 's' : ''} ·{' '}
                {editor.menuStatus === 'published' ? 'publié' : 'brouillon'}
              </p>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <MenuPreview groups={groups} editor={editor} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
