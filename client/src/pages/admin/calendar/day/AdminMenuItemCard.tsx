import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageX, Package, BookOpen, Trash2 } from 'lucide-react';
import type { MenuItem, MenuCategory } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';
import { AdminTagsBubble } from './AdminTagsBubble';
import type { UseMenuEditorReturn } from './useMenuEditor';
import { SwipeableRow } from './SwipeableRow';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface AdminMenuItemCardProps {
  item: MenuItem;
  category: MenuCategory;
  editor: UseMenuEditorReturn;
  canEdit: boolean;
  /** Joue l'indice de swipe (1er item, une fois par session). */
  hint?: boolean;
}

export function AdminMenuItemCard({
  item,
  category,
  editor,
  canEdit,
  hint,
}: AdminMenuItemCardProps) {
  const navigate = useNavigate();

  const color = getCategoryColor(category.color_key, category.order);
  const isOos = item.is_out_of_stock ?? false;
  const dishImage = item.dish?.image_url ?? null;
  const dishName = item.dish?.name ?? '';

  const [isRemoving, setIsRemoving] = useState(false);

  const handleDelete = () => {
    setIsRemoving(true);
    setTimeout(() => editor.removeItem(item.id!), 300);
  };

  const toggleOos = () => {
    if (item.id) editor.updateItem(item.id, { is_out_of_stock: !isOos });
  };

  const rowContent = (
    <div className="flex items-center gap-1">
      {/* Image du plat — à gauche, chevauche la card */}
      {dishImage && (
        <div className="relative z-10 h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
          <img src={dishImage} alt={dishName} className="h-full w-full object-cover" />
        </div>
      )}

      {/* Card */}
      <div
        className="relative z-0 min-w-0 flex-1"
        style={dishImage ? { marginLeft: '-12px' } : undefined}
      >
        <div
          className={cn(
            'rounded-2xl px-3 py-2.5 transition-colors',
            isOos && 'border-b-4 border-border bg-muted'
          )}
          style={
            isOos
              ? undefined
              : {
                  backgroundColor: color.bg,
                  borderBottom: `4px solid ${color.border}`,
                }
          }
        >
          <p
            className={cn(
              'truncate text-sm font-bold leading-snug transition-all',
              isOos && 'text-muted-foreground line-through'
            )}
            style={isOos ? undefined : { color: color.label }}
            title={dishName}
          >
            {dishName || <span className="font-normal italic opacity-50">Plat sans nom</span>}
          </p>
          <AdminTagsBubble item={item} />
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: isRemoving ? '0fr' : '1fr',
        opacity: isRemoving ? 0 : 1,
        transition: 'grid-template-rows 300ms ease, opacity 200ms ease',
      }}
    >
      <div style={{ overflow: 'hidden' }}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>
              {canEdit ? (
                <SwipeableRow
                  hint={hint}
                  left={{
                    variant: 'toggle',
                    onTrigger: toggleOos,
                    label: isOos ? 'Remettre' : 'Épuisé',
                    className: 'bg-amber-500 text-white',
                    icon: isOos ? (
                      <Package className="h-4 w-4" />
                    ) : (
                      <PackageX className="h-4 w-4" />
                    ),
                  }}
                  right={{
                    variant: 'destructive',
                    onTrigger: handleDelete,
                    label: 'Supprimer',
                    className: 'bg-destructive text-destructive-foreground',
                    icon: <Trash2 className="h-4 w-4" />,
                  }}
                >
                  {rowContent}
                </SwipeableRow>
              ) : (
                rowContent
              )}
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent className="w-52">
            {canEdit && (
              <>
                <ContextMenuItem onClick={toggleOos}>
                  {isOos ? (
                    <>
                      <Package className="mr-2 h-4 w-4" />
                      Remettre en stock
                    </>
                  ) : (
                    <>
                      <PackageX className="mr-2 h-4 w-4" />
                      Marquer épuisé
                    </>
                  )}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Retirer du menu
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            {item.dish_id && (
              <ContextMenuItem onClick={() => navigate(`/admin/catalogue/${item.dish_id}`)}>
                <BookOpen className="mr-2 h-4 w-4" />
                Voir dans le catalogue
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </div>
  );
}
