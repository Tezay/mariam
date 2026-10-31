import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { getApiErrorMessage } from '@/lib/api/errors';
import { parisToday } from '@/lib/date-utils';
import type { EgalimDeclaration, EgalimDeclarationInput } from '@/lib/api/quality';
import {
  declarationInput,
  declarationProblem,
  FIRST_EGALIM_YEAR,
  suggestedYear,
  formOfDeclaration,
  type DeclarationForm,
} from './egalim-form';

interface DeclarationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The year whose figures change; a new year is declared without it. */
  declaration?: EgalimDeclaration;
  declared: number[];
  onSubmit: (year: number, input: EgalimDeclarationInput) => Promise<void>;
}

function ShareField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          aria-describedby={`${id}-help`}
          onChange={(event) => onChange(event.target.value)}
          className="w-24"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}

export function DeclarationDialog({
  open,
  onOpenChange,
  declaration,
  declared,
  onSubmit,
}: DeclarationDialogProps) {
  const thisYear = Number(parisToday().slice(0, 4));
  const [form, setForm] = useState<DeclarationForm>({
    year: '',
    sustainable: '',
    organic: '',
    territorial: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = declaration !== undefined;

  useEffect(() => {
    if (!open) return;
    setForm(
      declaration
        ? formOfDeclaration(declaration)
        : { year: suggestedYear(thisYear, declared), sustainable: '', organic: '', territorial: '' }
    );
    setError(null);
  }, [open, declaration, declared, thisYear]);

  const change = (changes: Partial<DeclarationForm>) => setForm({ ...form, ...changes });

  const submit = async () => {
    const problem = declarationProblem(form, thisYear, editing ? [] : declared);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await onSubmit(Number(form.year), declarationInput(form));
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, "La déclaration n'a pas pu être enregistrée."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Achats de ${declaration.year}` : 'Déclarer une année'}
          </DialogTitle>
          <DialogDescription>
            Recopiez les taux de votre bilan annuel « ma cantine » : la part en valeur de vos achats
            alimentaires de l'année.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="egalim-year">Année des achats</Label>
              <Input
                id="egalim-year"
                type="number"
                inputMode="numeric"
                min={FIRST_EGALIM_YEAR}
                max={thisYear}
                value={form.year}
                onChange={(event) => change({ year: event.target.value })}
                className="w-28"
              />
            </div>
          )}
          <ShareField
            id="egalim-sustainable"
            label="Produits durables et de qualité"
            help="Bio, labels officiels, pêche durable… comme les compte EGalim."
            value={form.sustainable}
            onChange={(sustainable) => change({ sustainable })}
          />
          <ShareField
            id="egalim-organic"
            label="Dont produits bio"
            help="Une partie de la part ci-dessus."
            value={form.organic}
            onChange={(organic) => change({ organic })}
          />
          <ShareField
            id="egalim-territorial"
            label="Produits issus d'un projet alimentaire territorial"
            help="Facultatif. Laissez vide si vous ne la suivez pas."
            value={form.territorial}
            onChange={(territorial) => change({ territorial })}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Spinner />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
