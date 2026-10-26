import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Save } from 'lucide-react';
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

export function UnsavedChanges({
  hasChanges,
  isSaving,
  onSave,
}: {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
}) {
  const location = useLocation();
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (anchor?.href && hasChanges && anchor.target !== '_blank') {
        const url = new URL(anchor.href);
        if (url.pathname !== location.pathname) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavHref(anchor.href);
        }
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasChanges, location.pathname]);

  return (
    <>
      {hasChanges && (
        <>
          <div aria-hidden className="h-20 sidebar:hidden" />
          <div className="fixed inset-x-3 bottom-[4.75rem] z-30 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 sidebar:static sidebar:inset-x-auto sidebar:bottom-auto sidebar:z-auto sidebar:mt-8 sidebar:shadow-sm">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span className="hidden sm:inline">Modifications non enregistrées</span>
              <span className="sm:hidden">Non enregistré</span>
            </p>
            <Button onClick={onSave} disabled={isSaving} size="sm" className="gap-2">
              <Save className="h-3.5 w-3.5" />
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </>
      )}

      <AlertDialog
        open={pendingNavHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavHref(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non sauvegardées</AlertDialogTitle>
            <AlertDialogDescription>
              Vous avez des modifications non enregistrées. Si vous continuez, elles seront perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavHref(null)}>Rester</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingNavHref) window.location.href = pendingNavHref;
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Quitter sans sauvegarder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
