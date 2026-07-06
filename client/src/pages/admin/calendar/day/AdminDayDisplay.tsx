import { useCallback, useEffect, useState } from 'react';
import { PlusCircle, FileUp, Table2, ChefHat, MoreHorizontal, Trash2, Copy } from 'lucide-react';
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
import { ChefNotePopover } from './ChefNotePopover';
import { consumeSwipeHint } from './swipeHint';
import { DayImportCsv } from './DayImportCsv';
import { MenuCopyPopover } from '../selection/MenuCopyPopover';
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

type Mode = 'view' | 'import-csv';

// ─── PublishControl ───────────────────────────────────────────────────────────

function PublishControl({ editor }: { editor: UseMenuEditorReturn }) {
    const { menuStatus, isPublishing, isDirty, publishMenu, unpublishMenu } = editor;
    if (menuStatus === null) return null;

    const isEmpty = editor.items.length === 0;

    if (menuStatus === 'published' && !isEmpty) {
        return (
            <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    Publié
                </span>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={unpublishMenu}
                    disabled={isPublishing || isDirty}
                    title={isDirty ? 'Enregistrez le menu avant de modifier sa publication' : undefined}
                    className="h-7 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                >
                    {isPublishing ? '…' : 'Retirer'}
                </Button>
            </div>
        );
    }

    const title = isEmpty
        ? 'Ajoutez des plats pour publier'
        : isDirty
            ? 'Enregistrez le menu avant de publier'
            : undefined;

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sidebar:inline">
                {isEmpty ? 'Menu vide' : 'Non visible'}
            </span>
            <Button
                size="sm"
                onClick={publishMenu}
                disabled={isPublishing || isEmpty || isDirty}
                title={title}
                className="h-7 rounded-xl text-xs"
            >
                {isPublishing ? '…' : 'Publier'}
            </Button>
        </div>
    );
}

// ─── MenuEditToolbar ──────────────────────────────────────────────────────────

interface MenuEditToolbarProps {
    editor: UseMenuEditorReturn;
    onSave: () => Promise<void>;
    onReset: () => void;
    onDelete: () => void;
    onDuplicate: (anchor: { x: number; y: number }) => void;
    isDeletingMenu: boolean;
}

function MenuEditToolbar({ editor, onSave, onReset, onDelete, onDuplicate, isDeletingMenu }: MenuEditToolbarProps) {
    const { isDirty, isSaving, saveError } = editor;
    const busy = isSaving || editor.isPublishing;
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

    return (
        <>
            <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center gap-2 px-4 pt-2.5 pb-[5.75rem] rounded-t-2xl border-t border-border bg-card/95 backdrop-blur-sm shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)] sidebar:static sidebar:z-auto sidebar:bottom-auto sidebar:left-auto sidebar:right-auto sidebar:rounded-none sidebar:shadow-none sidebar:border-t-0 sidebar:border-b sidebar:pt-2 sidebar:pb-3.5 sidebar:bg-card/80 sidebar:shrink-0">
                <ChefNotePopover editor={editor} />
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
                        {isSaving ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                )}

                <div className="flex-1" />

                {saveError && <span className="text-xs text-destructive">{saveError}</span>}

                <PublishControl editor={editor} />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="rounded-xl w-8 h-8 p-0">
                            <MoreHorizontal className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => onDuplicate({ x: e.clientX, y: e.clientY })} className="text-xs gap-2">
                            <Copy className="w-3.5 h-3.5" />
                            Dupliquer
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
    const [dupeOpen, setDupeOpen] = useState(false);
    const [dupeAnchor, setDupeAnchor] = useState<{ x: number; y: number } | null>(null);

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

    const hasMenu = editor.items.length > 0 || editor.isDirty;

    const [showSwipeHint] = useState(consumeSwipeHint);
    const firstItemsCatId = categoriesWithItems.find(c => c.items.length > 0)?.category.id;

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <DayImportCsv
                open={mode === 'import-csv'}
                targetDate={date}
                restaurantId={restaurantId}
                categories={categories}
                onClose={() => setMode('view')}
                onImported={() => { setMode('view'); onReload(); }}
            />
            <MenuCopyPopover
                direction="export"
                open={dupeOpen}
                onOpenChange={setDupeOpen}
                anchorPoint={dupeAnchor}
                sourceItems={editor.items}
                restaurantId={restaurantId}
                onDone={() => { setDupeOpen(false); onReload(); }}
            />

            {canEdit && hasMenu && (
                <MenuEditToolbar
                    editor={editor}
                    onSave={handleSave}
                    onReset={editor.reset}
                    onDelete={() => requestAnimationFrame(() => setDeleteMenuConfirmOpen(true))}
                    onDuplicate={(anchor) => { setDupeAnchor(anchor); requestAnimationFrame(() => setDupeOpen(true)); }}
                    isDeletingMenu={isDeletingMenu}
                />
            )}

            <div className="flex-1 overflow-y-auto pb-36 sidebar:pb-4">
                <div className="p-4 space-y-4 max-w-2xl mx-auto">
                    {/* Événements : toujours affichés, qu'il y ait un menu ou non */}
                    {events.map(event => (
                        <EventCard key={event.id} event={event} onEdit={onEditEvent} />
                    ))}

                    {/* État sans menu */}
                    {!hasMenu && mode === 'view' && (
                        canEdit ? (
                            <div className={cn("flex flex-col items-center gap-3", events.length > 0 ? "pt-2" : "pt-8")}>
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
                                <MenuCopyPopover
                                    direction="import"
                                    targetDate={date}
                                    restaurantId={restaurantId}
                                    onDone={() => onReload()}
                                    align="start"
                                >
                                    <button
                                        type="button"
                                        className="w-full max-w-xs flex items-center gap-3 p-4 rounded-2xl border border-border hover:bg-muted/50 transition-colors text-left"
                                    >
                                        <FileUp className="w-5 h-5 text-muted-foreground shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">Importer depuis un autre jour</p>
                                            <p className="text-xs text-muted-foreground">Copier le menu d'une date existante</p>
                                        </div>
                                    </button>
                                </MenuCopyPopover>
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
                        ) : events.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                                <p className="text-sm text-muted-foreground">Aucun menu pour ce jour.</p>
                            </div>
                        ) : null
                    )}

                    {/* Contenu du menu */}
                    {hasMenu && (
                        <>
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
                                        hint={showSwipeHint && category.id === firstItemsCatId}
                                    />
                                ) : null
                            ))}
                        </>
                    )}
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
