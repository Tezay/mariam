import { useRef, useState } from 'react';
import { Camera, ImageIcon, ImagePlus, Images, Trash2, X } from 'lucide-react';
import type { GalleryImage, MenuItem, MenuCategory } from '@/lib/api';
import { getCategoryColor } from '@/lib/category-colors';
import { cn } from '@/lib/utils';
import { AdminTagsBubble } from './AdminTagsBubble';
import type { UseMenuEditorReturn } from './useMenuEditor';
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GalleryPicker } from '@/components/GalleryPicker';

interface AdminMenuItemCardProps {
    item: MenuItem;
    category: MenuCategory;
    editor: UseMenuEditorReturn;
    canEdit: boolean;
}

// ─── OOS trigger bubble ───────────────────────────────────────────────────────

function AdminOosTrigger({ item, editor }: { item: MenuItem; editor: UseMenuEditorReturn }) {
    const isOos = item.is_out_of_stock ?? false;
    return (
        <button
            type="button"
            onClick={() => editor.updateItem(item.id!, { is_out_of_stock: !isOos, replacement_label: isOos ? null : item.replacement_label })}
            title={isOos ? 'Marquer comme disponible' : 'Marquer comme épuisé'}
            className={cn(
                'rounded-full flex items-center gap-1 px-1.5 py-1 border shadow-sm transition-colors',
                isOos
                    ? 'bg-orange-500 text-white border-orange-400'
                    : 'bg-white dark:bg-card text-muted-foreground/60 border-gray-200 dark:border-border hover:border-orange-300 hover:text-orange-500',
            )}
        >
            {isOos
                ? <><span className="text-[9px] font-semibold">Épuisé</span></>
                : <><span className="text-[9px]">si épuisé ?</span></>
            }
        </button>
    );
}

// ─── Image button bubble ──────────────────────────────────────────────────────

interface AdminImageButtonProps {
    item: MenuItem;
    editor: UseMenuEditorReturn;
}

function AdminImageButton({ item, editor }: AdminImageButtonProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentImage = item.images?.[0] ?? null;
    const isNewItem = (item.id ?? 0) < 0;

    const handleFile = (file: File) => {
        editor.queueSetFileImage(item.id!, file);
        setDialogOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleGallerySelect = (galleryImage: GalleryImage) => {
        editor.queueSetGalleryImage(item.id!, galleryImage);
        setGalleryOpen(false);
        setDialogOpen(false);
    };

    const handleRemoveImage = () => {
        editor.queueRemoveImage(item.id!);
        setDialogOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setDialogOpen(true)}
                disabled={isNewItem}
                title={isNewItem ? 'Enregistrez d\'abord ce plat pour ajouter une image' : 'Photo du plat'}
                className={cn(
                    'rounded-full flex items-center gap-1 px-1.5 py-1 border shadow-sm transition-colors',
                    currentImage
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                        : 'bg-white dark:bg-card text-muted-foreground/60 border-gray-200 dark:border-border hover:border-primary/40 hover:text-primary',
                    isNewItem && 'opacity-40 cursor-not-allowed',
                )}
            >
                {currentImage
                    ? <ImageIcon className="w-3 h-3" />
                    : <ImagePlus className="w-3 h-3" />
                }
            </button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-xs">
                    <DialogHeader>
                        <DialogTitle>Photo du plat</DialogTitle>
                    </DialogHeader>
                    {currentImage && (
                        <img
                            src={currentImage.url}
                            alt={item.name}
                            className="w-full h-32 object-cover rounded-xl"
                        />
                    )}
                    <div className="flex flex-col gap-2 pt-1">
                        <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="gap-2 rounded-xl"
                        >
                            <Camera className="w-4 h-4" />
                            Depuis l'appareil
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setGalleryOpen(true)}
                            className="gap-2 rounded-xl"
                        >
                            <Images className="w-4 h-4" />
                            Galerie Mariam
                        </Button>
                        {currentImage && (
                            <Button
                                variant="ghost"
                                onClick={handleRemoveImage}
                                className="gap-2 rounded-xl text-destructive hover:text-destructive"
                            >
                                <Trash2 className="w-4 h-4" />
                                Supprimer la photo
                            </Button>
                        )}
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                    />
                </DialogContent>
            </Dialog>

            {galleryOpen && (
                <GalleryPicker
                    onClose={() => setGalleryOpen(false)}
                    onSelect={handleGallerySelect}
                    restaurantId={editor.restaurantId}
                    excludeIds={(item.images ?? []).map(i => i.gallery_image_id)}
                />
            )}
        </>
    );
}

// ─── AdminMenuItemCard ────────────────────────────────────────────────────────

export function AdminMenuItemCard({ item, category, editor, canEdit }: AdminMenuItemCardProps) {
    const color = getCategoryColor(category.color_key, category.order);
    const inputRef = useRef<HTMLInputElement>(null);
    const isOos = item.is_out_of_stock ?? false;
    const currentImage = item.images?.[0] ?? null;

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const confirmDelete = () => {
        setDeleteDialogOpen(false);
        setIsRemoving(true);
        setTimeout(() => editor.removeItem(item.id!), 300);
    };

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
                <div className="flex items-start">
                    {/* Image gauche — chevauche la card */}
                    {currentImage && (
                        <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 relative z-10">
                            <img src={currentImage.url} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                    )}

                    {/* Card + replacement */}
                    <div
                        className="flex-1 min-w-0 relative z-0"
                        style={currentImage ? { marginLeft: '-12px' } : undefined}
                    >
                        {/* Card */}
                        <div
                            className="relative group rounded-2xl px-3 py-2.5"
                            style={{
                                backgroundColor: color.bg,
                                borderBottom: `4px solid ${color.border}`,
                                paddingBottom: '14px',
                            }}
                        >
                            {/* Croix suppression — coin haut-droit */}
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => setDeleteDialogOpen(true)}
                                    className="absolute -top-2 -right-2 z-20 w-5 h-5 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            )}

                            {canEdit ? (
                                <input
                                    ref={inputRef}
                                    value={item.name}
                                    onChange={e => editor.updateItem(item.id!, { name: e.target.value })}
                                    className="w-full text-sm font-bold bg-transparent border-none outline-none pr-2"
                                    style={{ color: color.label }}
                                    placeholder="Nom du plat"
                                />
                            ) : (
                                <p className="text-sm font-bold leading-snug" style={{ color: color.label }}>
                                    {item.name}
                                </p>
                            )}

                            {/* Tags bubble — bottom right, straddling */}
                            <AdminTagsBubble item={item} editor={editor} canEdit={canEdit} />

                            {/* Bottom-left bubble group — straddling */}
                            {canEdit && (
                                <div className="absolute bottom-0 left-2 translate-y-1/3 z-20 flex items-center gap-1">
                                    <AdminOosTrigger item={item} editor={editor} />
                                    <AdminImageButton item={item} editor={editor} />
                                </div>
                            )}
                        </div>

                        {canEdit && (isOos || !!item.replacement_label) && (
                            <div className="mx-1 -mt-1 pt-4 pb-2.5 px-3 rounded-b-2xl border border-t-0 border-dashed border-orange-200 bg-orange-50 dark:bg-orange-900/10 flex items-center gap-2">
                                <input
                                    value={item.replacement_label ?? ''}
                                    onChange={e => editor.updateItem(item.id!, { replacement_label: e.target.value })}
                                    placeholder="Plat de substitution si rupture…"
                                    className="flex-1 text-xs bg-transparent border-none outline-none text-orange-700 dark:text-orange-300 placeholder:text-orange-400/60"
                                />
                                {item.replacement_label && (
                                    <button
                                        type="button"
                                        onClick={() => editor.updateItem(item.id!, { replacement_label: null })}
                                        className="shrink-0 text-orange-400 hover:text-orange-700 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer ce plat ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                « {item.name} » sera retiré du menu. Cette action peut être annulée en réinitialisant le menu.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Supprimer
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
