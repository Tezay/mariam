import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { useSiteRef } from '@/contexts/SiteContext';
import { getApiErrorMessage } from '@/lib/api/errors';
import { qualityApi, type EgalimDeclaration, type EgalimDeclarationInput } from '@/lib/api/quality';
import { notify } from '@/lib/toast';
import { formatShare } from '@/pages/public/site/quality-view';
import { DeclarationDialog } from './DeclarationDialog';
import { IconButton } from './IconButton';

export function DeclarationsField() {
  const site = useSiteRef();
  const [declarations, setDeclarations] = useState<EgalimDeclaration[]>([]);
  const [editing, setEditing] = useState<EgalimDeclaration | 'new' | null>(null);
  const [removing, setRemoving] = useState<EgalimDeclaration | null>(null);
  const declared = useMemo(() => declarations.map((item) => item.year), [declarations]);

  useEffect(() => {
    qualityApi
      .listDeclarations(site)
      .then(setDeclarations)
      .catch(() => {});
  }, [site]);

  const save = async (year: number, input: EgalimDeclarationInput) => {
    const saved = await qualityApi.putDeclaration(site, year, input);
    setDeclarations((previous) =>
      [...previous.filter((item) => item.year !== year), saved].sort((a, b) => b.year - a.year)
    );
  };

  const remove = async (year: number) => {
    try {
      await qualityApi.deleteDeclaration(site, year);
      setDeclarations((previous) => previous.filter((item) => item.year !== year));
    } catch (error) {
      notify.error(getApiErrorMessage(error, "La déclaration n'a pas pu être supprimée."));
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Vos achats, année par année</p>
        <p className="text-xs text-muted-foreground">
          La page montre la dernière année déclarée, comme le demande la loi EGalim. Chaque
          déclaration est enregistrée dès sa validation.
        </p>
      </div>
      {declarations.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {declarations.map((declaration) => (
            <li key={declaration.year} className="flex items-center gap-3 px-3 py-2.5">
              <span className="w-12 font-semibold tabular-nums">{declaration.year}</span>
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {formatShare(declaration.sustainable_share)} durables et de qualité, dont{' '}
                {formatShare(declaration.organic_share)} bio
                {declaration.territorial_share != null &&
                  ` · ${formatShare(declaration.territorial_share)} PAT`}
              </span>
              <IconButton
                label={`Modifier ${declaration.year}`}
                onClick={() => setEditing(declaration)}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={`Supprimer ${declaration.year}`}
                onClick={() => setRemoving(declaration)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
        <Plus className="h-4 w-4" />
        Déclarer une année
      </Button>

      <DeclarationDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        declaration={editing === 'new' || editing === null ? undefined : editing}
        declared={declared}
        onSubmit={save}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les achats de {removing?.year} ?</AlertDialogTitle>
            <AlertDialogDescription>
              S'il s'agit de la dernière année déclarée, la page publique montrera la précédente, ou
              plus aucun chiffre d'achats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) remove(removing.year);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
