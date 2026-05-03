import { useState, useRef } from 'react';
import { Upload, ChevronRight, Check } from 'lucide-react';
import { csvImportApi } from '@/lib/api';
import type { CsvUploadResponse, ImportPreviewResponse, ColumnMapping, MenuCategory } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

type Step = 'upload' | 'mapping' | 'preview';

interface DayImportCsvProps {
    open: boolean;
    targetDate: string;
    restaurantId: number | undefined;
    categories: MenuCategory[];
    onClose: () => void;
    onImported: () => void;
}

export function DayImportCsv({ open, targetDate, restaurantId, categories, onClose, onImported }: DayImportCsvProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<Step>('upload');
    const [uploadData, setUploadData] = useState<CsvUploadResponse | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping[]>([]);
    const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setStep('upload');
        setUploadData(null);
        setMapping([]);
        setPreviewData(null);
        setError(null);
    };

    // Step 1: Upload
    const handleUpload = async (file: File) => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await csvImportApi.upload(file);
            setUploadData(data);
            // Build initial mapping from auto_mapping
            const cols: ColumnMapping[] = data.columns.map(col => {
                const autoCategory = data.auto_mapping.categories?.[col];
                if (autoCategory) return { csv_column: col, target_field: 'category', category_id: autoCategory };
                return { csv_column: col, target_field: 'ignore' };
            });
            setMapping(cols);
            setStep('mapping');
        } catch {
            setError('Erreur lors du chargement du fichier.');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2 → 3: Preview
    const handlePreview = async () => {
        if (!uploadData) return;
        setIsLoading(true);
        setError(null);
        try {
            const data = await csvImportApi.preview(
                uploadData.file_id,
                mapping,
                { mode: 'start_date', start_date: targetDate, skip_weekends: false },
                restaurantId,
            );
            setPreviewData(data);
            setStep('preview');
        } catch {
            setError('Erreur lors de la prévisualisation.');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 3: Confirm
    const handleConfirm = async () => {
        if (!uploadData) return;
        setIsLoading(true);
        setError(null);
        try {
            await csvImportApi.confirm({
                file_id: uploadData.file_id,
                column_mapping: mapping,
                date_config: { mode: 'start_date', start_date: targetDate, skip_weekends: false },
                duplicate_action: 'replace',
                auto_publish: false,
                restaurant_id: restaurantId,
            });
            onImported();
        } catch {
            setError('Erreur lors de la confirmation.');
        } finally {
            setIsLoading(false);
        }
    };

    const topCategories = categories.filter(c => c.parent_id === null);

    return (
        <Sheet open={open} onOpenChange={o => { if (!o) { reset(); onClose(); } }}>
            <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>Importer depuis un fichier CSV</SheetTitle>
                </SheetHeader>

                {/* Step indicator */}
                <div className="flex items-center gap-2 px-1 py-2">
                    {(['upload', 'mapping', 'preview'] as Step[]).map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s ? 'bg-primary text-white' : step > s ? 'bg-primary/30 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                {i + 1}
                            </div>
                            <span className={`text-xs ${step === s ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                {s === 'upload' ? 'Fichier' : s === 'mapping' ? 'Colonnes' : 'Confirmer'}
                            </span>
                            {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    {step === 'upload' && (
                        <div
                            className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                            onClick={() => fileRef.current?.click()}
                        >
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <p className="text-sm font-medium text-foreground">Choisir un fichier CSV</p>
                            <p className="text-xs text-muted-foreground">CSV, délimiteur auto-détecté</p>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                            />
                        </div>
                    )}

                    {step === 'mapping' && uploadData && (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Associez chaque colonne CSV à une catégorie du menu.
                            </p>
                            {uploadData.columns.map((col, i) => {
                                const m = mapping[i];
                                return (
                                    <div key={col} className="flex items-center gap-2">
                                        <span className="text-xs font-mono bg-muted px-2 py-1 rounded-lg flex-1 truncate">{col}</span>
                                        <span className="text-muted-foreground text-xs">→</span>
                                        <select
                                            value={m.target_field === 'category' ? String(m.category_id) : m.target_field}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setMapping(prev => prev.map((mp, j) =>
                                                    j !== i ? mp :
                                                    val === 'ignore' ? { ...mp, target_field: 'ignore', category_id: undefined } :
                                                    { ...mp, target_field: 'category', category_id: parseInt(val, 10) }
                                                ));
                                            }}
                                            className="flex-1 rounded-xl border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="ignore">Ignorer</option>
                                            {topCategories.map(cat => (
                                                <option key={cat.id} value={String(cat.id)}>{cat.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {step === 'preview' && previewData && (
                        <div className="space-y-3">
                            <div className="flex gap-2 text-xs">
                                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                    {previewData.new_count} nouveau{previewData.new_count > 1 ? 'x' : ''}
                                </span>
                                {previewData.duplicates_count > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                        {previewData.duplicates_count} doublon{previewData.duplicates_count > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            {previewData.menus.map(m => (
                                <div key={m.date} className="rounded-xl border border-border bg-card p-3 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-semibold">{m.date_display}</p>
                                        {m.has_duplicate && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Remplace</span>
                                        )}
                                    </div>
                                    <ul className="space-y-0.5">
                                        {m.items.slice(0, 5).map((item, i) => (
                                            <li key={i} className="text-xs text-foreground/70">{item.name}</li>
                                        ))}
                                        {m.items.length > 5 && (
                                            <li className="text-xs text-muted-foreground">+{m.items.length - 5} plats</li>
                                        )}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <SheetFooter className="gap-2">
                    <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={isLoading}>
                        Annuler
                    </Button>
                    {step === 'mapping' && (
                        <Button onClick={handlePreview} disabled={isLoading} className="gap-1.5">
                            {isLoading ? '…' : 'Prévisualiser'}
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    )}
                    {step === 'preview' && (
                        <Button onClick={handleConfirm} disabled={isLoading} className="gap-1.5">
                            <Check className="w-4 h-4" />
                            {isLoading ? 'Import…' : 'Confirmer l\'import'}
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
