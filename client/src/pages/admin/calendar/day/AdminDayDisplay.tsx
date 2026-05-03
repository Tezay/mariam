import { useCallback, useEffect, useState } from 'react';
import { PlusCircle, FileUp, Table2, ChefHat, MoreHorizontal, Trash2 } from 'lucide-react';
import { menusApi } from '@/lib/api';
import type { Event, Menu, MenuCategory } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMenuEditor } from './useMenuEditor';
import type { UseMenuEditorReturn } from './useMenuEditor';
import { AdminCategorySection } from './AdminCategorySection';
import { ImportFromDayPanel } from './ImportFromDayPanel';
import { DayImportCsv } from './DayImportCsv';
import { EventCard } from '../EventCard';

interface AdminDayDisplayProps {
    date: string;
    menu: Menu | null;
    restaurantId: number | undefined;
    canEdit: boolean;
    categories: MenuCategory[];
    events: Event[];
    onEditEvent?: (event: Event) => void;
    onReload: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onStartOnboarding?: (date: string) => void;
}

type Mode = 'view' | 'import-day' | 'import-csv';

// ─── MenuEditToolbar ──────────────────────────────────────────────────────────

interface MenuEditToolbarProps {
    editor: UseMenuEditorReturn;
    onSave: () => Promise<void>;
    onReset: () => void;
    onDelete: () => void;
    isDeletingMenu: boolean;
}

function MenuEditToolbar({ editor, onSave, onReset, onDelete, isDeletingMenu }: MenuEditToolbarProps) {
    const { menuStatus, isDirty, isSaving, isPublishing, publishMenu, unpublishMenu, saveError } = editor;
    const busy = isSaving || isPublishing;
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

    return (
        <>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-card/80 backdrop-blur-sm">
                {isDirty && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResetConfirmOpen(true)}
                        disabled={busy}
                        className="rounded-xl text-xs"
                    >
                        Annuler
                    </Button>
                )}
                {isDirty && (
                    <Button size="sm" onClick={onSave} disabled={busy} className="rounded-xl text-xs">
                        {isSaving ? 'Enregistrement…' : 'Mettre à jour'}
                    </Button>
                )}

                <div className="flex-1" />

                {saveError && <span className="text-xs text-destructive">{saveError}</span>}

                {menuStatus !== null && (
                    <button
                        type="button"
                        onClick={menuStatus === 'published' ? unpublishMenu : publishMenu}
                        disabled={busy}
                        className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold border transition-colors',
                            menuStatus === 'published'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
                        )}
                    >
                        {isPublishing ? '…' : menuStatus === 'published' ? 'Publié' : 'Brouillon'}
                    </button>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="rounded-xl w-8 h-8 p-0">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                            Dupliquer
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                            Partager
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={onDelete}
                            disabled={isDeletingMenu}
                            className="text-destructive focus:text-destructive text-xs gap-2"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Supprimer ce menu
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Annuler les modifications ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Toutes les modifications non enregistrées seront perdues.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Retour</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { onReset(); setResetConfirmOpen(false); }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Annuler les modifications
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

// ─── AdminDayDisplay ──────────────────────────────────────────────────────────

export function AdminDayDisplay({ date, menu, restaurantId, canEdit, categories, events, onEditEvent, onReload, onDirtyChange, onStartOnboarding }: AdminDayDisplayProps) {
    const [mode, setMode] = useState<Mode>('view');
    const [isDeletingMenu, setIsDeletingMenu] = useState(false);
    const [deleteMenuConfirmOpen, setDeleteMenuConfirmOpen] = useState(false);

    const editor = useMenuEditor({ date, menu, restaurantId });

    useEffect(() => {
        onDirtyChange?.(editor.isDirty);
    }, [editor.isDirty, onDirtyChange]);

    const handleSave = useCallback(async () => {
        await editor.save();
        onReload();
    }, [editor, onReload]);

    const handleDeleteMenu = async () => {
        if (!menu) return;
        setIsDeletingMenu(true);
        try {
            await menusApi.delete(menu.id);
            onReload();
        } catch { /* ignore */ } finally {
            setIsDeletingMenu(false);
            setDeleteMenuConfirmOpen(false);
        }
    };

    const topCategories = categories.filter(c => c.parent_id === null);
    const categoriesWithItems = topCategories
        .map(cat => {
            const subIds = new Set(
                (cat.subcategories ?? []).map(s => s.id).concat([cat.id])
            );
            return { category: cat, items: editor.items.filter(i => subIds.has(i.category_id)) };
        })
        .filter(({ items }) => items.length > 0 || canEdit);

    const hasMenu = !!menu || editor.items.length > 0;

    if (!hasMenu && mode === 'view') {
        if (!canEdit) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center">
                    <p className="text-sm text-muted-foreground">Aucun menu pour ce jour.</p>
                </div>
            );
        }
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
                <p className="text-sm font-medium text-muted-foreground mb-2">Que souhaitez-vous faire ?</p>
                <button
                    type="button"
                    onClick={() => onStartOnboarding?.(date)}
                    className="w-full max-w-xs flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-colors text-left"
                >
                    <PlusCircle className="w-5 h-5 text-primary shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-primary">Créer un nouveau menu</p>
                        <p className="text-xs text-muted-foreground">Saisir les plats catégorie par catégorie</p>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => setMode('import-day')}
                    className="w-full max-w-xs flex items-center gap-3 p-4 rounded-2xl border border-border hover:bg-muted/50 transition-colors text-left"
                >
                    <FileUp className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-foreground">Importer depuis un autre jour</p>
                        <p className="text-xs text-muted-foreground">Copier le menu d'une date existante</p>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={() => setMode('import-csv')}
                    className="w-full max-w-xs flex items-center gap-3 p-4 rounded-2xl border border-border hover:bg-muted/50 transition-colors text-left"
                >
                    <Table2 className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-foreground">Importer depuis un fichier</p>
                        <p className="text-xs text-muted-foreground">Charger un fichier CSV</p>
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <ImportFromDayPanel
                open={mode === 'import-day'}
                targetDate={date}
                restaurantId={restaurantId}
                onClose={() => setMode('view')}
                onImported={() => { setMode('view'); onReload(); }}
            />
            <DayImportCsv
                open={mode === 'import-csv'}
                targetDate={date}
                restaurantId={restaurantId}
                categories={categories}
                onClose={() => setMode('view')}
                onImported={() => { setMode('view'); onReload(); }}
            />

            {canEdit && hasMenu && (
                <MenuEditToolbar
                    editor={editor}
                    onSave={handleSave}
                    onReset={editor.reset}
                    onDelete={() => setDeleteMenuConfirmOpen(true)}
                    isDeletingMenu={isDeletingMenu}
                />
            )}

            <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4 max-w-2xl mx-auto">
                    {events.map(event => (
                        <EventCard key={event.id} event={event} onEdit={onEditEvent} />
                    ))}

                    {canEdit && (
                        <div className={cn(
                            'flex items-start gap-2 rounded-2xl px-4 py-3 transition-colors',
                            editor.chefNote ? 'bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800' : 'bg-muted/30',
                        )}>
                            <ChefHat className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
                            <textarea
                                value={editor.chefNote}
                                onChange={e => editor.setChefNote(e.target.value)}
                                placeholder="Ajouter une note du chef…"
                                rows={editor.chefNote ? 2 : 1}
                                className="flex-1 bg-transparent border-none outline-none text-sm text-amber-900 dark:text-amber-100 placeholder:text-amber-700/50 resize-none"
                            />
                        </div>
                    )}
                    {!canEdit && menu?.chef_note && (
                        <div className="flex items-start gap-2 rounded-2xl px-4 py-3 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                            <ChefHat className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
                            <p className="text-sm text-amber-900 dark:text-amber-100">{menu.chef_note}</p>
                        </div>
                    )}

                    {categoriesWithItems.map(({ category, items }) => (
                        items.length > 0 || canEdit ? (
                            <AdminCategorySection
                                key={category.id}
                                category={category}
                                items={items}
                                editor={editor}
                                canEdit={canEdit}
                            />
                        ) : null
                    ))}
                </div>
            </div>

            <AlertDialog open={deleteMenuConfirmOpen} onOpenChange={setDeleteMenuConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce menu ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            L'ensemble des plats de ce jour seront supprimés.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteMenu}
                            disabled={isDeletingMenu}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
