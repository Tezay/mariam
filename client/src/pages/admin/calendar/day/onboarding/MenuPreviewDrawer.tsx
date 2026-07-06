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

export function MenuPreviewDrawer({ groups, editor, dateLabel, hidden, flyTargetRef }: MenuPreviewDrawerProps) {
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
                    'fixed right-0 top-[3.75rem] z-40 flex items-center gap-0.5 pl-1 pr-1.5 py-1.5',
                    'bg-card/90 backdrop-blur-sm border border-r-0 border-border/70 shadow-sm rounded-l-xl',
                    'transition-all duration-200 active:scale-[0.97]',
                    hidden && 'translate-x-full opacity-0 pointer-events-none',
                )}
            >
                <ChevronLeft className="w-3 h-3 text-muted-foreground/70" />
                <motion.span
                    key={count}
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 0.3 }}
                    className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold"
                >
                    {count}
                </motion.span>
            </button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-full max-w-[320px] p-0 flex flex-col">
                    <SheetHeader className="shrink-0 px-4 h-14 flex-row items-center justify-between space-y-0 border-b border-border text-left">
                        <div className="min-w-0">
                            <SheetTitle className="text-sm capitalize truncate">{dateLabel}</SheetTitle>
                            <p className="text-[11px] text-muted-foreground">
                                {count} plat{count > 1 ? 's' : ''} · {editor.menuStatus === 'published' ? 'publié' : 'brouillon'}
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
