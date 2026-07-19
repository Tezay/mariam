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

export function MenuPreviewPanel({
  groups,
  editor,
  dateLabel,
  flyTargetRef,
}: MenuPreviewPanelProps) {
  const count = editor.items.length;
  return (
    <aside className="hidden w-[380px] shrink-0 flex-col border-l border-border bg-card/50 sidebar:flex">
      <div
        ref={flyTargetRef}
        className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold capitalize">{dateLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            {editor.menuStatus === 'published' ? 'Publié' : 'Brouillon'}
            {editor.isSaving
              ? ' · Sauvegarde…'
              : editor.isDirty
                ? ''
                : count > 0
                  ? ' · Sauvegardé'
                  : ''}
          </p>
        </div>
        <motion.span
          key={count}
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 0.3 }}
          className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-bold text-primary"
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
