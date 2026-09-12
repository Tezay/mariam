import {
  CheckSquare,
  Download,
  FolderInput,
  Scale,
  SquareArrowOutUpRight,
  Tags,
  Trash2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { canCompare } from '../rules';
import type { BulkActions } from './BulkBar';

/**
 * Right-click over the dish list, desktop only.
 *
 * Its actions read the current selection: a dish outside it has already become
 * the selection by the time the menu opens, the rule every file explorer uses.
 */
export function DishContextMenu({
  count,
  targetName,
  actions,
  onOpen,
  onDeselect,
  onClose,
  onCompare,
  children,
}: {
  count: number;
  targetName: string | null;
  actions: BulkActions;
  onOpen: () => void;
  onDeselect: () => void;
  onClose: () => void;
  onCompare: () => void;
  children: React.ReactNode;
}) {
  const plural = count > 1;

  return (
    <ContextMenu onOpenChange={(open) => !open && onClose()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {targetName && (
          <>
            <ContextMenuItem onSelect={onOpen} disabled={plural}>
              <SquareArrowOutUpRight className="mr-2 h-4 w-4 text-muted-foreground" />
              Ouvrir la fiche
            </ContextMenuItem>
            <ContextMenuItem onSelect={onDeselect}>
              <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
              {plural ? `Quitter la sélection (${count})` : 'Quitter la sélection'}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={onCompare} disabled={!canCompare(count)}>
          <Scale className="mr-2 h-4 w-4 text-muted-foreground" />
          Comparer
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.askMove} disabled={count === 0}>
          <FolderInput className="mr-2 h-4 w-4 text-muted-foreground" />
          Changer de catégorie
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.askLabels} disabled={count === 0}>
          <Tags className="mr-2 h-4 w-4 text-muted-foreground" />
          Labels et certifications
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.download} disabled={count === 0}>
          <Download className="mr-2 h-4 w-4 text-muted-foreground" />
          Exporter en CSV
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={actions.askDelete}
          disabled={count === 0}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
