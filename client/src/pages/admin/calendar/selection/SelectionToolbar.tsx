import { useState } from 'react';
import { X, Copy, Trash2 } from 'lucide-react';
import { menusApi } from '@/lib/api';
import type { MenuItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
import { DuplicatePanel } from './DuplicatePanel';
import type { UseSelectionReturn } from './useSelection';

interface SelectionToolbarProps {
    selection: UseSelectionReturn;
    selectedItems: MenuItem[];
    onClearAndReload: () => void;
}

export function SelectionToolbar({ selection, selectedItems, onClearAndReload }: SelectionToolbarProps) {
    const [duplicatePanelOpen, setDuplicatePanelOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    if (!selection.selectionMode || selection.selection.length === 0) return null;

    const count = selection.selectedItemCount;

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const byDate = new Map<string, MenuItem[]>();
            for (const entry of selection.selection) {
                if (entry.type !== 'item') continue;
                const item = selectedItems.find(i => i.id === entry.itemId);
                if (!item) continue;
                const list = byDate.get(entry.date) ?? [];
                list.push(item);
                byDate.set(entry.date, list);
            }
            for (const [date, items] of byDate.entries()) {
                const remainingIds = new Set(items.map(i => i.id));
                await menusApi.save(date, items.filter(i => !remainingIds.has(i.id)));
            }
            selection.clearSelection();
            onClearAndReload();
        } catch { /* ignore */ } finally {
            setIsDeleting(false);
            setDeleteConfirmOpen(false);
        }
    };

    return (
        <>
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border rounded-2xl shadow-lg px-4 py-2.5">
                <button
                    type="button"
                    onClick={selection.clearSelection}
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                >
                    <X className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium text-foreground">
                    {count} item{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
                </span>
                <div className="w-px h-4 bg-border" />
                <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 rounded-xl"
                    onClick={() => setDuplicatePanelOpen(true)}
                >
                    <Copy className="w-3.5 h-3.5" />
                    Dupliquer
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={isDeleting}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer
                </Button>
            </div>

            <DuplicatePanel
                open={duplicatePanelOpen}
                sourceItems={selectedItems}
                onClose={() => setDuplicatePanelOpen(false)}
                onDone={() => {
                    setDuplicatePanelOpen(false);
                    selection.clearSelection();
                    onClearAndReload();
                }}
            />

            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer {count} plat{count > 1 ? 's' : ''} ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ces plats seront définitivement retirés de leurs menus.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
