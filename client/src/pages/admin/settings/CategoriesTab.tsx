/**
 * Onglet Catégories : CRUD des catégories de menu (enregistrement immédiat,
 * indépendant du bouton Enregistrer global).
 */
import { useState, useEffect, useCallback } from 'react';
import { categoriesApi, MenuCategory } from '@/lib/api';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Plus, Star, ChevronRight } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CategoryRow, SortableCatList, CategoryPatch } from './CategoryComponents';

export function CategoriesTab() {
    const [categories, setCategories] = useState<MenuCategory[]>([]);
    const [catLoading, setCatLoading] = useState(true);
    const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

    const loadCategories = useCallback(async () => {
        setCatLoading(true);
        try {
            const { categories: cats } = await categoriesApi.list();
            setCategories(cats);
        } catch {
            // ignore
        } finally {
            setCatLoading(false);
        }
    }, []);

    useEffect(() => { loadCategories(); }, [loadCategories]);

    const handleCategoryUpdate = async (id: number, data: CategoryPatch) => {
        try {
            const updated = await categoriesApi.update(id, data);
            setCategories(prev => prev.map(c => {
                if (c.id === id) return { ...c, ...updated };
                // Mettre à jour dans les sous-catégories
                if (c.subcategories?.some(s => s.id === id)) {
                    return {
                        ...c,
                        subcategories: c.subcategories.map(s => s.id === id ? { ...s, ...updated } : s),
                    };
                }
                return c;
            }));
        } catch {
            notify.error('Erreur lors de la mise à jour de la catégorie');
        }
    };

    const confirmCategoryDelete = async () => {
        if (!deletingCategoryId) return;
        try {
            await categoriesApi.delete(deletingCategoryId);
            await loadCategories();
        } catch {
            notify.error('Impossible de supprimer cette catégorie');
        } finally {
            setDeletingCategoryId(null);
        }
    };

    const handleSubcategoryReorder = async (reordered: MenuCategory[]) => {
        const orderItems = reordered.map((c, i) => ({ id: c.id, order: i }));
        await categoriesApi.reorder(orderItems);
        await loadCategories();
        notify.success('Ordre mis à jour');
    };

    const handleAddCategory = async () => {
        try {
            await categoriesApi.create({ label: 'Nouvelle catégorie', order: categories.length });
            await loadCategories();
        } catch {
            notify.error("Erreur lors de la création de la catégorie");
        }
    };

    const handleAddSubcategory = async (parentId: number) => {
        try {
            const parent = categories.find(c => c.id === parentId);
            const subCount = parent?.subcategories?.length ?? 0;
            await categoriesApi.create({ label: 'Nouvelle sous-catégorie', order: subCount, parent_id: parentId });
            await loadCategories();
        } catch {
            notify.error("Erreur lors de la création de la sous-catégorie");
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Catégories de menu</CardTitle>
                <CardDescription>
                    Les modifications sont enregistrées immédiatement.
                    L'étoile <Star className="inline w-3 h-3 text-amber-500" /> indique les catégories principales pour l'affichage du menu public.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {catLoading ? (
                    <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <DndContext
                            collisionDetection={closestCenter}
                            onDragEnd={async (event: DragEndEvent) => {
                                const { active, over } = event;
                                if (!over || active.id === over.id) return;
                                const topLevel = categories.filter(c => c.parent_id === null);
                                const fromIdx = topLevel.findIndex(c => c.id === active.id);
                                const toIdx = topLevel.findIndex(c => c.id === over.id);
                                if (fromIdx === -1 || toIdx === -1) return;
                                const reordered = arrayMove(topLevel, fromIdx, toIdx);
                                setCategories(prev => {
                                    const rest = prev.filter(c => c.parent_id !== null);
                                    return [...reordered, ...rest];
                                });
                                await categoriesApi.reorder(reordered.map((c, i) => ({ id: c.id, order: i })));
                                await loadCategories();
                                notify.success('Ordre mis à jour');
                            }}
                        >
                            <SortableContext
                                items={categories.filter(c => c.parent_id === null).map(c => c.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                {categories.filter(c => c.parent_id === null).map(cat => (
                                    <div key={cat.id} className="space-y-2">
                                        <CategoryRow
                                            category={cat}
                                            onUpdate={handleCategoryUpdate}
                                            onDelete={setDeletingCategoryId}
                                        />
                                        {cat.subcategories && cat.subcategories.length > 0 && (
                                            <div className="mt-1">
                                                <SortableCatList
                                                    items={cat.subcategories}
                                                    onUpdate={handleCategoryUpdate}
                                                    onDelete={setDeletingCategoryId}
                                                    onReorderDone={handleSubcategoryReorder}
                                                    indent
                                                />
                                                <button
                                                    onClick={() => handleAddSubcategory(cat.id)}
                                                    className="ml-8 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Ajouter une sous-catégorie à « {cat.label} »
                                                </button>
                                            </div>
                                        )}
                                        {(!cat.subcategories || cat.subcategories.length === 0) && cat.is_protected && (
                                            <button
                                                onClick={() => handleAddSubcategory(cat.id)}
                                                className="ml-8 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1 mt-1"
                                            >
                                                <ChevronRight className="w-3.5 h-3.5" />
                                                <Plus className="w-3.5 h-3.5" />
                                                Ajouter une sous-catégorie
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </SortableContext>
                        </DndContext>

                        <Button variant="outline" onClick={handleAddCategory} className="mt-4 gap-2">
                            <Plus className="w-4 h-4" />
                            Ajouter une catégorie principale
                        </Button>
                    </div>
                )}

                <AlertDialog open={deletingCategoryId !== null} onOpenChange={open => { if (!open) setDeletingCategoryId(null); }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer cette catégorie ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Les items associés à cette catégorie seront également supprimés.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeletingCategoryId(null)}>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmCategoryDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Supprimer
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
