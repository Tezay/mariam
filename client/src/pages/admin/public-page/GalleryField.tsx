import { useState } from 'react';
import { ArrowLeft, ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
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
import type { SitePhoto } from '@/lib/api/sites';
import { PHOTOS_MAX } from '@/lib/site-profile';
import { IconButton } from './IconButton';
import { PhotoDialog } from './PhotoDialog';
import type { PublicPageState } from './usePublicPageState';

export function GalleryField({ state }: { state: PublicPageState }) {
  const { images, addPhoto, updatePhoto, deletePhoto, movePhoto } = state;
  const photos = images.photos;
  const [dialog, setDialog] = useState<{ photo?: SitePhoto } | null>(null);
  const [removing, setRemoving] = useState<SitePhoto | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label>Galerie</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {photos.length}/{PHOTOS_MAX}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Jusqu'à {PHOTOS_MAX} photos de la salle, de l'équipe ou des plats. Décrivez chacune en
        quelques mots pour les personnes malvoyantes.
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((photo, index) => (
          <li key={photo.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <img src={photo.url} alt={photo.alt} className="aspect-[4/3] w-full object-cover" />
            <div className="space-y-1 p-2">
              <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{photo.alt}</p>
              <div className="flex items-center">
                <IconButton
                  label="Déplacer avant"
                  disabled={index === 0}
                  onClick={() => movePhoto(index, -1)}
                >
                  <ArrowLeft />
                </IconButton>
                <IconButton
                  label="Déplacer après"
                  disabled={index === photos.length - 1}
                  onClick={() => movePhoto(index, 1)}
                >
                  <ArrowRight />
                </IconButton>
                <div className="flex-1" />
                <IconButton label="Modifier la description" onClick={() => setDialog({ photo })}>
                  <Pencil />
                </IconButton>
                <IconButton label="Retirer la photo" onClick={() => setRemoving(photo)}>
                  <Trash2 className="text-destructive" />
                </IconButton>
              </div>
            </div>
          </li>
        ))}
        {photos.length < PHOTOS_MAX && (
          <li>
            <button
              type="button"
              onClick={() => setDialog({})}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <Plus aria-hidden className="h-5 w-5" />
              Ajouter une photo
            </button>
          </li>
        )}
      </ul>

      <PhotoDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        photo={dialog?.photo}
        onSubmit={(file, alt) =>
          dialog?.photo?.id !== undefined
            ? updatePhoto(dialog.photo.id, alt)
            : addPhoto(file as File, alt)
        }
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette photo ?</AlertDialogTitle>
            <AlertDialogDescription>
              Elle disparaît aussitôt de la galerie de la page publique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing?.id !== undefined) deletePhoto(removing.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
