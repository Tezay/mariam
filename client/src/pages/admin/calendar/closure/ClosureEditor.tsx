import { useState, useEffect } from 'react';
import { Trash2, CalendarOff } from 'lucide-react';
import { closuresApi } from '@/lib/api';
import type { ExceptionalClosure } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ClosureEditorProps {
  open: boolean;
  closure?: ExceptionalClosure | null;
  prefillStart?: string;
  prefillEnd?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  isSingleDay: boolean;
  start_date: string;
  end_date: string;
  reason: string;
  description: string;
}

const EMPTY: FormData = {
  isSingleDay: true,
  start_date: '',
  end_date: '',
  reason: '',
  description: '',
};

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isMobile;
}

export function ClosureEditor({
  open,
  closure,
  prefillStart,
  prefillEnd,
  onClose,
  onSaved,
}: ClosureEditorProps) {
  const isEditing = !!closure;
  const isMobile = useIsMobile();
  const [form, setForm] = useState<FormData>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (closure) {
      setForm({
        isSingleDay: closure.start_date === closure.end_date,
        start_date: closure.start_date,
        end_date: closure.end_date,
        reason: closure.reason ?? '',
        description: closure.description ?? '',
      });
    } else {
      const start = prefillStart ?? '';
      const end = prefillEnd ?? '';
      setForm({
        isSingleDay: !end || start === end,
        start_date: start,
        end_date: end,
        reason: '',
        description: '',
      });
    }
    setError(null);
  }, [open, closure, prefillStart, prefillEnd]);

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.start_date) {
      setError('La date de début est requise.');
      return;
    }
    if (!form.isSingleDay && !form.end_date) {
      setError('La date de fin est requise.');
      return;
    }
    if (!form.isSingleDay && form.end_date < form.start_date) {
      setError('La date de fin doit être après la date de début.');
      return;
    }
    setIsSaving(true);
    setError(null);
    const payload = {
      start_date: form.start_date,
      end_date: form.isSingleDay ? form.start_date : form.end_date,
      reason: form.reason.trim() || undefined,
      description: form.description.trim() || undefined,
    };
    try {
      if (closure) {
        await closuresApi.update(closure.id, payload);
      } else {
        await closuresApi.create(payload);
      }
      onSaved();
    } catch {
      setError('Erreur lors de la sauvegarde. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!closure) return;
    setIsDeleting(true);
    try {
      await closuresApi.delete(closure.id);
      onSaved();
    } catch {
      setError('Erreur lors de la suppression.');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const busy = isSaving || isDeleting;
  const inputClass =
    'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  // ── Corps du formulaire ───────────────────────
  const body = (
    <div className="space-y-4">
      {/* Jour / Plage — segmented control */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
        {(
          [
            { value: true, label: 'Un seul jour' },
            { value: false, label: 'Plage de dates' },
          ] as const
        ).map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => set('isSingleDay', opt.value)}
            className={cn(
              'rounded-lg py-2 text-sm font-medium transition-colors',
              form.isSingleDay === opt.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className={cn('grid gap-3', !form.isSingleDay && 'grid-cols-2')}>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {form.isSingleDay ? 'Date' : 'Début'}
          </label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => set('start_date', e.target.value)}
            className={inputClass}
          />
        </div>
        {!form.isSingleDay && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Fin</label>
            <input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={(e) => set('end_date', e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Motif (optionnel)
        </label>
        <input
          type="text"
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
          placeholder="Ex : Vacances scolaires, Travaux…"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Description (optionnel)
        </label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Informations complémentaires…"
          rows={3}
          className={cn(inputClass, 'resize-none')}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );

  // ── Actions (partagées) ──────────────────────────────────────────────────
  const actions = (
    <>
      {isEditing && (
        <Button
          variant="ghost"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={busy}
          className="order-last text-destructive hover:bg-destructive/10 hover:text-destructive sm:order-first sm:mr-auto"
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Supprimer
        </Button>
      )}
      <Button variant="ghost" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
        Annuler
      </Button>
      <Button onClick={handleSave} disabled={busy} className="w-full sm:w-auto">
        {isSaving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </>
  );

  return (
    <>
      {isMobile ? (
        <Drawer
          open={open}
          onOpenChange={(o) => {
            if (!o && !busy) onClose();
          }}
        >
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-muted-foreground" />
                {isEditing ? 'Modifier la fermeture' : 'Nouvelle fermeture'}
              </DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4">{body}</div>
            <DrawerFooter className="flex-col gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {actions}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            if (!o && !busy) onClose();
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? 'Modifier la fermeture' : 'Nouvelle fermeture exceptionnelle'}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">{body}</div>
            <DialogFooter className="gap-2 sm:items-center">{actions}</DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette fermeture ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette fermeture exceptionnelle sera définitivement supprimée.
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
