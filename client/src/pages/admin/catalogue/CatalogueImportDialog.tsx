import { useState, useMemo } from 'react';
import { Check, BookOpen } from 'lucide-react';
import {
  catalogImportApi,
  type CatalogImportUploadResponse,
  type CatalogImportPreviewResponse,
  type MenuCategory,
  type DietaryTag,
  type CertificationItem,
} from '@/lib/api';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { CsvStepIndicator } from '@/components/csv-import/CsvStepIndicator';
import { CsvDropzone } from '@/components/csv-import/CsvDropzone';

type Step = 'upload' | 'configure' | 'preview';

const STEPS = [
  { id: 'upload' as const, label: 'Fichier' },
  { id: 'configure' as const, label: 'Configuration' },
  { id: 'preview' as const, label: 'Aperçu' },
];

interface CatalogueImportDialogProps {
  open: boolean;
  categories: MenuCategory[];
  allTags: DietaryTag[];
  allCerts: CertificationItem[];
  onClose: () => void;
  onImported: () => void;
}

export function CatalogueImportDialog({
  open,
  categories,
  allTags,
  allCerts,
  onClose,
  onImported,
}: CatalogueImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [uploadData, setUploadData] = useState<CatalogImportUploadResponse | null>(null);
  const [previewData, setPreviewData] = useState<CatalogImportPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration
  const [nameColumn, setNameColumn] = useState('');
  const [tagColumns, setTagColumns] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [autoDetect, setAutoDetect] = useState(true);

  // Catégories feuilles avec contexte parent (« Parent › Sous-catégorie »)
  const categoryOptions = useMemo(() => {
    const opts: { id: number; label: string }[] = [];
    for (const c of categories) {
      if (c.subcategories?.length) {
        for (const sub of c.subcategories)
          opts.push({ id: sub.id, label: `${c.label} › ${sub.label}` });
      } else {
        opts.push({ id: c.id, label: c.label });
      }
    }
    return opts;
  }, [categories]);

  const tagMap = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const certMap = useMemo(() => new Map(allCerts.map((c) => [c.id, c])), [allCerts]);

  const reset = () => {
    setStep('upload');
    setUploadData(null);
    setPreviewData(null);
    setError(null);
    setNameColumn('');
    setTagColumns(new Set());
    setCategoryId('');
    setAutoDetect(true);
    setIsLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  // Étape 1 : upload
  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await catalogImportApi.upload(file);
      setUploadData(data);
      setNameColumn(data.suggested_name_column ?? data.columns[0] ?? '');
      setStep('configure');
    } catch {
      setError('Erreur lors du chargement du fichier.');
    } finally {
      setIsLoading(false);
    }
  };

  // Étape 2 → 3 : prévisualisation
  const handlePreview = async () => {
    if (!uploadData || !nameColumn || categoryId === '') return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await catalogImportApi.preview({
        file_id: uploadData.file_id,
        name_column: nameColumn,
        tag_columns: [...tagColumns],
        category_id: categoryId,
        auto_detect_tags: autoDetect,
      });
      setPreviewData(data);
      setStep('preview');
    } catch {
      setError('Erreur lors de la prévisualisation.');
    } finally {
      setIsLoading(false);
    }
  };

  // Étape 3 : confirmation
  const handleConfirm = async () => {
    if (!uploadData || !nameColumn || categoryId === '') return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await catalogImportApi.confirm({
        file_id: uploadData.file_id,
        name_column: nameColumn,
        tag_columns: [...tagColumns],
        category_id: categoryId,
        auto_detect_tags: autoDetect,
      });
      const { created_count, skipped_count } = result;
      notify.success(
        `${created_count} plat${created_count > 1 ? 's' : ''} importé${created_count > 1 ? 's' : ''}`,
        skipped_count > 0
          ? `${skipped_count} doublon${skipped_count > 1 ? 's' : ''} ignoré${skipped_count > 1 ? 's' : ''}`
          : undefined
      );
      onImported();
      close();
    } catch {
      setError("Erreur lors de l'import.");
      setIsLoading(false);
    }
  };

  const toggleTagColumn = (col: string) => {
    setTagColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const canPreview = Boolean(nameColumn) && categoryId !== '';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer des plats</DialogTitle>
          <DialogDescription>
            Ajoutez plusieurs plats au catalogue depuis un fichier CSV ou Excel.
          </DialogDescription>
        </DialogHeader>

        <CsvStepIndicator steps={STEPS} current={step} />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
          {/* Étape 1 — Fichier */}
          {step === 'upload' && (
            <CsvDropzone
              accept=".csv,.xlsx,.xls"
              hint="CSV ou Excel — une ligne par plat"
              onFile={handleUpload}
            />
          )}

          {/* Étape 2 — Configuration */}
          {step === 'configure' && uploadData && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>
                  Catégorie des plats importés <span className="text-destructive">*</span>
                </Label>
                <select
                  value={categoryId === '' ? '' : String(categoryId)}
                  onChange={(e) =>
                    setCategoryId(e.target.value ? parseInt(e.target.value, 10) : '')
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Choisir une catégorie…</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.id} value={String(opt.id)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Tous les plats du fichier seront rangés dans cette catégorie.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>
                  Colonne du nom du plat <span className="text-destructive">*</span>
                </Label>
                <select
                  value={nameColumn}
                  onChange={(e) => setNameColumn(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {uploadData.columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>
                  Colonnes « tags & labels »{' '}
                  <span className="font-normal text-muted-foreground">(optionnel)</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ces colonnes seront analysées pour détecter les régimes alimentaires et
                  certifications.
                </p>
                <div className="flex flex-wrap gap-2">
                  {uploadData.columns
                    .filter((c) => c !== nameColumn)
                    .map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => toggleTagColumn(col)}
                        className={cn(
                          'rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                          tagColumns.has(col)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {col}
                      </button>
                    ))}
                  {uploadData.columns.filter((c) => c !== nameColumn).length === 0 && (
                    <p className="text-xs italic text-muted-foreground">
                      Aucune autre colonne disponible.
                    </p>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Détecter les tags depuis le nom</p>
                  <p className="text-xs text-muted-foreground">
                    Analyse le nom du plat pour suggérer les tags et labels.
                  </p>
                </div>
                <Switch checked={autoDetect} onCheckedChange={setAutoDetect} />
              </label>
            </div>
          )}

          {/* Étape 3 — Aperçu */}
          {step === 'preview' && previewData && (
            <div className="space-y-3">
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  {previewData.new_count} à créer
                </span>
                {previewData.duplicate_count > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    {previewData.duplicate_count} doublon
                    {previewData.duplicate_count > 1 ? 's' : ''} ignoré
                    {previewData.duplicate_count > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {previewData.total === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <BookOpen className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Aucun plat détecté dans le fichier.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {previewData.dishes.map((dish, i) => (
                    <li
                      key={i}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2',
                        dish.is_duplicate && 'opacity-50'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{dish.name}</p>
                        {(dish.tags.length > 0 || dish.certifications.length > 0) && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {dish.tags.map((id) => {
                              const t = tagMap.get(id);
                              if (!t) return null;
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px]"
                                  style={{ color: t.color }}
                                  title={t.label}
                                >
                                  <Icon
                                    name={t.icon as IconName}
                                    className="h-2.5 w-2.5 shrink-0"
                                  />
                                  <span className="text-muted-foreground">{t.label}</span>
                                </span>
                              );
                            })}
                            {dish.certifications.map((id) => {
                              const c = certMap.get(id);
                              if (!c) return null;
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[11px] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
                                  title={c.name}
                                >
                                  <img
                                    src={`/certifications/${c.logo_filename}`}
                                    alt={c.name}
                                    className="h-3 w-3 object-contain"
                                  />
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {dish.is_duplicate && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          Doublon
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          {step === 'configure' && (
            <Button variant="ghost" onClick={() => setStep('upload')} disabled={isLoading}>
              Retour
            </Button>
          )}
          {step === 'preview' && (
            <Button variant="ghost" onClick={() => setStep('configure')} disabled={isLoading}>
              Retour
            </Button>
          )}
          {step === 'upload' && (
            <Button variant="ghost" onClick={close} disabled={isLoading}>
              Annuler
            </Button>
          )}
          {step === 'configure' && (
            <Button onClick={handlePreview} disabled={isLoading || !canPreview}>
              {isLoading ? '…' : 'Prévisualiser'}
            </Button>
          )}
          {step === 'preview' && (
            <Button
              onClick={handleConfirm}
              disabled={isLoading || previewData?.new_count === 0}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              {isLoading
                ? 'Import…'
                : `Importer ${previewData?.new_count ?? 0} plat${(previewData?.new_count ?? 0) > 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
