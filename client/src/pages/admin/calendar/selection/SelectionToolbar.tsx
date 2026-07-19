import { X, Trash2, PackageX, Package, Copy } from 'lucide-react';
import type { MenuItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { MenuCopyPopover } from './MenuCopyPopover';
import type { UseSelectionReturn } from './useSelection';

interface SelectionToolbarProps {
  selection: UseSelectionReturn;
  selectedItems: MenuItem[];
  restaurantId: number | undefined;
  onMarkOos: () => void;
  onMarkInStock: () => void;
  onRemove: () => void;
  onClearAndReload: () => void;
}

export function SelectionToolbar({
  selection,
  selectedItems,
  restaurantId,
  onMarkOos,
  onMarkInStock,
  onRemove,
  onClearAndReload,
}: SelectionToolbarProps) {
  const count = selection.selectedItemCount;
  const single = count === 1;
  const singleOos = single && (selectedItems[0]?.is_out_of_stock ?? false);

  return (
    <>
      <button
        type="button"
        onClick={selection.clearSelection}
        className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="shrink-0 text-xs font-medium text-foreground">
        {count} sélectionné{count > 1 ? 's' : ''}
      </span>
      <div className="flex-1" />

      {/* Stock — 1 item : toggle selon son état ; plusieurs : les deux actions */}
      {single ? (
        singleOos ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-xl text-xs text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
            onClick={onMarkInStock}
          >
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Remettre en stock</span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-xl text-xs text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
            onClick={onMarkOos}
          >
            <PackageX className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Marquer épuisé</span>
          </Button>
        )
      ) : (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-xl text-xs text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
            onClick={onMarkOos}
          >
            <PackageX className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Marquer tout épuisé</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-xl text-xs text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
            onClick={onMarkInStock}
          >
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tout remettre en stock</span>
          </Button>
        </>
      )}

      <MenuCopyPopover
        direction="export"
        sourceItems={selectedItems}
        restaurantId={restaurantId}
        onDone={onClearAndReload}
        align="end"
      >
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 rounded-xl text-xs">
          <Copy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Dupliquer</span>
        </Button>
      </MenuCopyPopover>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {single ? 'Retirer du menu' : `Tout retirer du menu (${count})`}
        </span>
      </Button>
    </>
  );
}
