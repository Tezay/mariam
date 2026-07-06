/**
 * Panel desktop : aperçu persistant du menu en construction, affiché à droite
 * du wizard à partir du breakpoint `sidebar:`.
 */
import { motion } from 'framer-motion';
import type { UseMenuEditorReturn } from '../useMenuEditor';
import { MenuPreview } from './MenuPreview';
import type { CatGroup } from './types';

interface MenuPreviewPanelProps {
    groups: CatGroup[];
    editor: UseMenuEditorReturn;
    dateLabel: string;
    /** Ref d'enregistrement de la cible de l'animation « vol vers l'aperçu ». */
    flyTargetRef: (el: HTMLElement | null) => void;
}

export function MenuPreviewPanel({ groups, editor, dateLabel, flyTargetRef }: MenuPreviewPanelProps) {
    const count = editor.items.length;
    return (
        <aside className="hidden sidebar:flex flex-col w-[380px] shrink-0 border-l border-border bg-card/50">
            <div ref={flyTargetRef} className="shrink-0 flex items-center justify-between gap-2 px-4 h-14 border-b border-border">
                <div className="min-w-0">
                    <p className="text-sm font-semibold truncate capitalize">{dateLabel}</p>
                    <p className="text-[11px] text-muted-foreground">
                        {editor.menuStatus === 'published' ? 'Publié' : 'Brouillon'}
                        {editor.isSaving ? ' · Sauvegarde…' : editor.isDirty ? '' : count > 0 ? ' · Sauvegardé' : ''}
                    </p>
                </div>
                <motion.span
                    key={count}
                    initial={{ scale: 1 }}
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 0.3 }}
                    className="shrink-0 inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-primary/10 text-primary text-xs font-bold"
                >
                    {count}
                </motion.span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <MenuPreview groups={groups} editor={editor} />
            </div>
        </aside>
    );
}
