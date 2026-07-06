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

export function AdminMenuItemCard({ item, category, editor, canEdit, hint }: AdminMenuItemCardProps) {
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
                <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 relative z-10">
                    <img src={dishImage} alt={dishName} className="w-full h-full object-cover" />
                </div>
            )}

            {/* Card */}
            <div className="flex-1 min-w-0 relative z-0" style={dishImage ? { marginLeft: '-12px' } : undefined}>
                <div
                    className={cn('rounded-2xl px-3 py-2.5 transition-colors', isOos && 'bg-muted border-b-4 border-border')}
                    style={isOos ? undefined : { backgroundColor: color.bg, borderBottom: `4px solid ${color.border}` }}
                >
                    <p
                        className={cn('text-sm font-bold leading-snug truncate transition-all', isOos && 'line-through text-muted-foreground')}
                        style={isOos ? undefined : { color: color.label }}
                        title={dishName}
                    >
                        {dishName || <span className="opacity-50 italic font-normal">Plat sans nom</span>}
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
                                        icon: isOos ? <Package className="w-4 h-4" /> : <PackageX className="w-4 h-4" />,
                                    }}
                                    right={{
                                        variant: 'destructive',
                                        onTrigger: handleDelete,
                                        label: 'Supprimer',
                                        className: 'bg-destructive text-destructive-foreground',
                                        icon: <Trash2 className="w-4 h-4" />,
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
                                    {isOos
                                        ? <><Package className="w-4 h-4 mr-2" />Remettre en stock</>
                                        : <><PackageX className="w-4 h-4 mr-2" />Marquer épuisé</>
                                    }
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    onClick={handleDelete}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Retirer du menu
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                            </>
                        )}
                        {item.dish_id && (
                            <ContextMenuItem onClick={() => navigate(`/admin/catalogue/${item.dish_id}`)}>
                                <BookOpen className="w-4 h-4 mr-2" />
                                Voir dans le catalogue
                            </ContextMenuItem>
                        )}
                    </ContextMenuContent>
                </ContextMenu>
            </div>
        </div>
    );
}
