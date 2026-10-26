import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { SitePhoto } from '@/lib/api/sites';
import { IMAGE_ACCEPT, imageFileProblem } from '@/lib/image-files';
import { TEXT_MAX } from '@/lib/site-profile';
import { CountedField } from './CountedField';

interface PhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The photo whose description changes; a new one is added without it. */
  photo?: SitePhoto;
  onSubmit: (file: File | null, alt: string) => Promise<void>;
}

export function PhotoDialog({ open, onOpenChange, photo, onSubmit }: PhotoDialogProps) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = photo !== undefined;

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setAlt(photo?.alt ?? '');
    setError(null);
  }, [open, photo]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const ready = alt.trim() !== '' && (editing || file !== null) && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(file, alt.trim());
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, "La photo n'a pas pu être enregistrée."));
    } finally {
      setBusy(false);
    }
  };

  const shown = editing ? photo.url : preview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Modifier la description' : 'Ajouter une photo'}</DialogTitle>
          <DialogDescription>
            La description est lue aux personnes malvoyantes : dites en quelques mots ce que montre
            la photo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shown ? (
            <img src={shown} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <ImagePlus aria-hidden className="h-6 w-6" />
              Choisir une photo
            </button>
          )}
          {!editing && file && (
            <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
              Choisir une autre photo
            </Button>
          )}
          <input
            ref={input}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = '';
              if (!picked) return;
              const problem = imageFileProblem(picked);
              setError(problem);
              if (!problem) setFile(picked);
            }}
          />

          <CountedField
            id="photo-alt"
            label="Description"
            help="Par exemple : « La salle du premier étage, côté parc »."
            value={alt}
            max={TEXT_MAX.alt}
            onChange={setAlt}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!ready}>
            {busy && <Spinner />}
            {editing ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
