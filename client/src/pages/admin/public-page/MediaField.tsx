import { useRef, useState } from 'react';
import { ImageIcon, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
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
import { IMAGE_ACCEPT } from '@/lib/image-files';
import { cn } from '@/lib/utils';

interface MediaFieldProps {
  label: string;
  help: string;
  url: string | null;
  shape: 'square' | 'wide';
  busy: boolean;
  removeTitle: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}

export function MediaField({
  label,
  help,
  url,
  shape,
  busy,
  removeTitle,
  onPick,
  onRemove,
}: MediaFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted',
            shape === 'square' ? 'h-24 w-24' : 'aspect-video w-full sm:w-64'
          )}
        >
          {url ? (
            <img
              src={url}
              alt=""
              className={cn(
                'h-full w-full',
                shape === 'square' ? 'object-contain p-2' : 'object-cover'
              )}
            />
          ) : (
            <ImageIcon aria-hidden className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{help}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? <Spinner /> : <Upload />}
              {url ? 'Remplacer' : 'Envoyer une image'}
            </Button>
            {url && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                Retirer
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Lets the same file be picked again.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              L'image disparaît aussitôt de la page publique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRemove}
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
