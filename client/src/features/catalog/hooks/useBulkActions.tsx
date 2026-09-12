import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import {
  catalogApi,
  type BulkDeleteResult,
  type CertificationItem,
  type DietaryTag,
  type MenuCategory,
} from '@/lib/api';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { downloadBlob } from '@/lib/download';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { categoryPath, leafCategories, pathLabel } from '../categories';

/**
 * The four actions a dish selection offers, with their dialogs.
 *
 * Held here rather than in the floating bar because the context menu triggers
 * the very same ones, and two copies of four dialogs would drift.
 */
export function useBulkActions({
  ids,
  categories,
  allTags,
  allCerts,
  onDone,
}: {
  ids: number[];
  categories: MenuCategory[];
  allTags: DietaryTag[];
  allCerts: CertificationItem[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [kept, setKept] = useState<BulkDeleteResult['kept'] | null>(null);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState<number | ''>('');
  const [labelling, setLabelling] = useState(false);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [certIds, setCertIds] = useState<string[]>([]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalogue'] });
  const leaves = leafCategories(categories);

  const remove = useMutation({
    mutationFn: () => catalogApi.bulkDelete(ids),
    onSuccess: (result) => {
      refresh();
      setConfirming(false);
      if (result.kept.length > 0) {
        setKept(result.kept);
      } else {
        notify.success(`${result.deleted.length} plats supprimés`);
        onDone();
      }
    },
    onError: () => notify.error('La suppression a échoué'),
  });

  const move = useMutation({
    mutationFn: () => catalogApi.bulkCategory(ids, Number(target)),
    onSuccess: ({ moved, kept }) => {
      refresh();
      setMoving(false);
      setTarget('');
      notify.success(
        `${moved.length} plats déplacés`,
        kept.length > 0
          ? `${kept.length} conservés : un plat de même nom occupe déjà la catégorie`
          : undefined
      );
      onDone();
    },
    onError: () => notify.error('Le changement de catégorie a échoué'),
  });

  const label = useMutation({
    mutationFn: () =>
      catalogApi.bulkLabels(
        ids,
        mode === 'add'
          ? { add_tag_ids: tagIds, add_certification_ids: certIds }
          : { remove_tag_ids: tagIds, remove_certification_ids: certIds }
      ),
    onSuccess: (updated) => {
      refresh();
      setLabelling(false);
      setTagIds([]);
      setCertIds([]);
      notify.success(`${updated.length} plats mis à jour`);
      onDone();
    },
    onError: () => notify.error('La mise à jour des labels a échoué'),
  });

  const download = async () => {
    try {
      downloadBlob(await catalogApi.exportCsv({ ids }), 'catalogue.csv');
    } catch {
      notify.error("L'export a échoué");
    }
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];

  const dialogs = (
    <>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer {ids.length} plat{ids.length > 1 ? 's' : ''} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les plats déjà servis dans un menu sont conservés. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={kept !== null}
        onOpenChange={(open) => {
          if (!open) {
            setKept(null);
            onDone();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suppression partielle</DialogTitle>
            <DialogDescription>
              {kept?.length} plat{(kept?.length ?? 0) > 1 ? 's ont' : ' a'} été conservé
              {(kept?.length ?? 0) > 1 ? 's' : ''} :{' '}
              {(kept?.length ?? 0) > 1 ? 'ils figurent' : 'il figure'} encore dans des menus.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {kept?.map((dish) => (
              <li key={dish.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-foreground">{dish.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {dish.usage_count} service{dish.usage_count > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              onClick={() => {
                setKept(null);
                onDone();
              }}
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer de catégorie</DialogTitle>
            <DialogDescription>
              Les {ids.length} plats sélectionnés rejoindront la catégorie choisie.
            </DialogDescription>
          </DialogHeader>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value ? Number(event.target.value) : '')}
            aria-label="Catégorie de destination"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">Choisir une catégorie</option>
            {leaves.map((category) => (
              <option key={category.id} value={category.id}>
                {pathLabel(categoryPath(categories, category.id))}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              Annuler
            </Button>
            <Button onClick={() => move.mutate()} disabled={target === '' || move.isPending}>
              Déplacer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={labelling} onOpenChange={setLabelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Labels et certifications</DialogTitle>
            <DialogDescription>
              Appliquer une modification aux {ids.length} plats sélectionnés.
            </DialogDescription>
          </DialogHeader>

          <div className="flex w-fit items-center rounded-lg border border-border bg-muted/40 p-0.5">
            {(['add', 'remove'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  'rounded-md px-3 py-1 text-sm transition-colors',
                  mode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                {value === 'add' ? 'Ajouter' : 'Retirer'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => setTagIds(toggle(tagIds, tag.id))}
                aria-pressed={tagIds.includes(tag.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
                  tagIds.includes(tag.id)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
                )}
              >
                {tag.icon && <Icon name={tag.icon as IconName} className="h-3.5 w-3.5 shrink-0" />}
                {tag.label}
              </button>
            ))}
            {allCerts.map((cert) => (
              <button
                key={cert.id}
                type="button"
                onClick={() => setCertIds(toggle(certIds, cert.id))}
                aria-pressed={certIds.includes(cert.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors',
                  certIds.includes(cert.id)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-muted text-muted-foreground hover:border-primary/40'
                )}
              >
                {cert.logo_filename && (
                  <img
                    src={`/certifications/${cert.logo_filename}`}
                    alt=""
                    className="h-3.5 w-3.5 shrink-0 object-contain"
                  />
                )}
                {cert.name}
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setLabelling(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => label.mutate()}
              disabled={(tagIds.length === 0 && certIds.length === 0) || label.isPending}
            >
              {mode === 'add' ? 'Ajouter' : 'Retirer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    askDelete: () => setConfirming(true),
    askMove: () => setMoving(true),
    askLabels: () => setLabelling(true),
    download,
    dialogs,
  };
}
