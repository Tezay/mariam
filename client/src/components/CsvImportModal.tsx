/**
 * MARIAM - Import CSV Modal (Wizard multi-étapes)
 * 
 * Permet d'importer des menus depuis un fichier CSV ou Excel.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { csvImportApi, MenuItem, MenuCategory, adminApi } from '@/lib/api';
import { DEFAULT_CATEGORIES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Upload, X, FileSpreadsheet, ArrowRight, ArrowLeft,
    Check, AlertTriangle, FileWarning, Loader2, HelpCircle
} from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface CsvImportModalProps {
    restaurantId: number;
    weekStart: string;
    onClose: () => void;
    onImportComplete: () => void;
}

type ImportStep = 'upload' | 'mapping' | 'dates' | 'duplicates' | 'preview';

interface ColumnMapping {
    csv_column: string;
    target_field: 'date' | 'category' | 'ignore';
    category_id?: string;
}

interface DateConfig {
    mode: 'from_file' | 'align_week' | 'start_date';
    start_date?: string;
    skip_weekends: boolean;
    date_format?: string;
    auto_detect_tags: boolean;
}

interface UploadedFile {
    file_id: string;
    filename: string;
    columns: string[];
    preview_rows: Record<string, string>[];
    row_count: number;
    auto_mapping: {
        date?: string;
        categories?: Record<string, string>;
    };
    detected_date_format?: string;
}

interface PreviewMenu {
    date: string;
    date_display: string;
    items: MenuItem[];
    has_duplicate: boolean;
    existing_menu?: {
        id: number;
        status: string;
        items: MenuItem[];
    };
}

const STEP_ORDER: ImportStep[] = ['upload', 'mapping', 'dates', 'duplicates', 'preview'];

const STEP_LABELS: Record<ImportStep, string> = {
    upload: 'Fichier',
    mapping: 'Colonnes',
    dates: 'Dates',
    duplicates: 'Doublons',
    preview: 'Aperçu'
};

export function CsvImportModal({ restaurantId, weekStart, onClose, onImportComplete }: CsvImportModalProps) {
    // État global
    const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Données du fichier uploadé
    const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);

    // Configuration du mapping
    const [columnMapping, setColumnMapping] = useState<ColumnMapping[]>([]);

    // Configuration des dates
    const [dateConfig, setDateConfig] = useState<DateConfig>({
        mode: 'align_week',
        start_date: weekStart,
        skip_weekends: true,
        auto_detect_tags: true
    });

    // Gestion des doublons
    const [duplicateAction, setDuplicateAction] = useState<'skip' | 'replace' | 'merge'>('replace');

    // Preview
    const [preview, setPreview] = useState<PreviewMenu[]>([]);
    const [previewStats, setPreviewStats] = useState({ total: 0, duplicates: 0, new: 0 });

    // Auto-publish
    const [autoPublish, setAutoPublish] = useState(false);

    // Help Popover
    const [helpOpen, setHelpOpen] = useState(false);

    // Pluralization Helper
    const plural = (count: number, singular: string, plural: string) => count > 1 ? `${count} ${plural}` : `${count} ${singular}`;

    // Catégories du restaurant
    const [categories, setCategories] = useState<MenuCategory[]>(DEFAULT_CATEGORIES);

    // Ref pour l'input file
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Charger les catégories du restaurant
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const settings = await adminApi.getSettings();
                if (settings.config?.menu_categories?.length) {
                    setCategories(settings.config.menu_categories);
                }
            } catch (err) {
                console.error('Erreur chargement catégories:', err);
            }
        };
        loadCategories();
    }, []);

    // Navigation
    const currentStepIndex = STEP_ORDER.indexOf(currentStep);

    const canGoNext = useCallback(() => {
        switch (currentStep) {
            case 'upload':
                return uploadedFile !== null;
            case 'mapping':
                // Au moins une catégorie mappée
                return columnMapping.some(m => m.target_field === 'category' && m.category_id);
            case 'dates':
                return true;
            case 'duplicates':
                return true;
            case 'preview':
                return preview.length > 0;
            default:
                return false;
        }
    }, [currentStep, uploadedFile, columnMapping, preview]);
    // Upload du fichier
    const handleFileSelect = async (file: File) => {
        setError(null);
        setIsLoading(true);

        try {
            const result = await csvImportApi.upload(file);
            setUploadedFile(result);

            // Initialiser le mapping avec les suggestions automatiques
            const initialMapping: ColumnMapping[] = result.columns.map(col => {
                if (result.auto_mapping?.date === col) {
                    return { csv_column: col, target_field: 'date' as const };
                }
                if (result.auto_mapping?.categories?.[col]) {
                    return {
                        csv_column: col,
                        target_field: 'category' as const,
                        category_id: result.auto_mapping.categories[col]
                    };
                }
                return { csv_column: col, target_field: 'ignore' as const };
            });
            setColumnMapping(initialMapping);

            // Mettre à jour le format de date détecté
            if (result.detected_date_format) {
                setDateConfig(prev => ({ ...prev, date_format: result.detected_date_format }));
            }

        } catch (err) {
            console.error('Erreur upload:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors de l\'upload');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    // Mise à jour du mapping
    const updateMapping = (colIndex: number, updates: Partial<ColumnMapping>) => {
        setColumnMapping(prev => prev.map((m, i) =>
            i === colIndex ? { ...m, ...updates } : m
        ));
    };

    // Charger l'aperçu
    const loadPreview = async () => {
        if (!uploadedFile) return null;

        setIsLoading(true);
        setError(null);

        try {
            const result = await csvImportApi.preview(
                uploadedFile.file_id,
                columnMapping,
                dateConfig
            );

            setPreview(result.menus);
            setPreviewStats({
                total: result.total_count,
                duplicates: result.duplicates_count,
                new: result.new_count
            });

            return result;

        } catch (err) {
            console.error('Erreur preview:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors de la prévisualisation');
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const goNext = async () => {
        const nextIndex = currentStepIndex + 1;
        if (nextIndex < STEP_ORDER.length) {
            let nextStep = STEP_ORDER[nextIndex];

            // Si on vient de "dates" : charger l'aperçu pour vérifier les doublons
            if (currentStep === 'dates') {
                const result = await loadPreview();
                // Si l'aperçu a chargé et qu'il n'y a pas de doublons : sauter étape "duplicates"
                if (result && result.duplicates_count === 0) {
                    nextStep = 'preview';
                }
            }
            // Cas normal (ex: duplicates -> preview) : recharger pour être sûr
            else if (nextStep === 'preview' || nextStep === 'duplicates') {
                await loadPreview();
            }

            setCurrentStep(nextStep);
        }
    };

    const goPrev = () => {
        const prevIndex = currentStepIndex - 1;
        if (prevIndex >= 0) {
            let prevStep = STEP_ORDER[prevIndex];

            // Si on est à "preview" et qu'il n'y avait pas de doublons : retourner à "dates"
            if (currentStep === 'preview' && previewStats.duplicates === 0) {
                prevStep = 'dates';
            }

            setCurrentStep(prevStep);
        }
    };

    // Confirmer l'import
    const handleConfirmImport = async () => {
        if (!uploadedFile) return;

        setIsLoading(true);
        setError(null);

        try {
            await csvImportApi.confirm({
                file_id: uploadedFile.file_id,
                column_mapping: columnMapping,
                date_config: dateConfig,
                duplicate_action: duplicateAction,
                auto_publish: autoPublish,
                restaurant_id: restaurantId
            });

            onImportComplete();

        } catch (err) {
            console.error('Erreur import:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors de l\'import');
        } finally {
            setIsLoading(false);
        }
    };

    // Render de chaque étape
    const renderUploadStep = () => (
        <div className="space-y-6">
            <div
                className={`
                    border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
                    ${isLoading
                        ? 'border-primary/50 bg-primary/5'
                        : uploadedFile
                            ? 'border-green-500/50 bg-green-500/5'
                            : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }
                `}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => !isLoading && fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />

                {isLoading ? (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-12 h-12 text-primary animate-spin" />
                        <p className="text-muted-foreground">Analyse du fichier...</p>
                    </div>
                ) : uploadedFile ? (
                    <div className="flex flex-col items-center gap-3">
                        <FileSpreadsheet className="w-12 h-12 text-green-500" />
                        <div>
                            <p className="font-medium text-foreground">{uploadedFile.filename}</p>
                            <p className="text-sm text-muted-foreground">
                                {uploadedFile.row_count} ligne(s) • {uploadedFile.columns.length} colonne(s)
                            </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={(e) => {
                            e.stopPropagation();
                            setUploadedFile(null);
                            setColumnMapping([]);
                        }}>
                            Changer de fichier
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3">
                        <Upload className="w-12 h-12 text-muted-foreground" />
                        <div>
                            <p className="font-medium text-foreground">
                                Glissez votre fichier ici
                            </p>
                            <p className="text-sm text-muted-foreground">
                                ou cliquez pour parcourir
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Formats acceptés : CSV, Excel (.xlsx)
                        </p>
                        <Popover open={helpOpen} onOpenChange={setHelpOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="link"
                                    size="sm"
                                    className="text-primary mt-2 flex items-center gap-1"
                                    onClick={(e) => { e.stopPropagation(); }}
                                >
                                    <HelpCircle className="w-4 h-4" />
                                    Format attendu ?
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-4" onClick={(e) => e.stopPropagation()}>
                                <h4 className="font-semibold mb-2">Format de fichier recommandé</h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                    Une ligne par jour. Les colonnes peuvent être dans n'importe quel ordre.
                                </p>
                                <div className="text-xs border rounded overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th className="p-1">Date</th>
                                                <th className="p-1">Entrée</th>
                                                <th className="p-1">Plat</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-t">
                                                <td className="p-1">Lundi</td>
                                                <td className="p-1">Carottes</td>
                                                <td className="p-1">Poulet</td>
                                            </tr>
                                            <tr className="border-t">
                                                <td className="p-1">Mardi</td>
                                                <td className="p-1">Salade</td>
                                                <td className="p-1">Poisson</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 italic">
                                    Les tags (VG, Bio...) sont détectés automatiquement.
                                </p>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </div>

            {uploadedFile && uploadedFile.preview_rows.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 border-b">
                        <p className="text-sm font-medium">Aperçu des données</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/30">
                                <tr>
                                    {uploadedFile.columns.map((col, i) => (
                                        <th key={i} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {uploadedFile.preview_rows.slice(0, 5).map((row, rowIdx) => (
                                    <tr key={rowIdx} className="border-t">
                                        {uploadedFile.columns.map((col, colIdx) => (
                                            <td key={colIdx} className="px-3 py-2 text-foreground whitespace-nowrap">
                                                {row[col] || <span className="text-muted-foreground/50">—</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );

    const renderMappingStep = () => (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Associez chaque colonne de votre fichier à un champ MARIAM.
            </p>

            <div className="space-y-3">
                {columnMapping.map((mapping, index) => (
                    <div key={index} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                                {mapping.csv_column}
                            </p>
                            {uploadedFile?.preview_rows[0]?.[mapping.csv_column] && (
                                <p className="text-xs text-muted-foreground truncate">
                                    Ex: {uploadedFile.preview_rows[0][mapping.csv_column]}
                                </p>
                            )}
                        </div>

                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                        <select
                            className="flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                            value={mapping.target_field === 'category' && mapping.category_id
                                ? `category:${mapping.category_id}`
                                : mapping.target_field}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value.startsWith('category:')) {
                                    updateMapping(index, {
                                        target_field: 'category',
                                        category_id: value.replace('category:', '')
                                    });
                                } else {
                                    updateMapping(index, {
                                        target_field: value as 'date' | 'ignore',
                                        category_id: undefined
                                    });
                                }
                            }}
                        >
                            <option value="ignore">— Ignorer —</option>
                            <option value="date">Date</option>
                            <optgroup label="Catégories">
                                {categories.map(cat => (
                                    <option key={cat.id} value={`category:${cat.id}`}>
                                        {cat.label}
                                    </option>
                                ))}
                            </optgroup>
                        </select>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2 pt-4 border-t">
                <input
                    type="checkbox"
                    id="auto-detect-tags"
                    checked={dateConfig.auto_detect_tags}
                    onChange={(e) => setDateConfig(prev => ({ ...prev, auto_detect_tags: e.target.checked }))}
                    className="rounded"
                />
                <Label htmlFor="auto-detect-tags" className="text-sm cursor-pointer">
                    Détecter automatiquement les tags (VG, Halal, Bio...)
                </Label>
            </div>
        </div>
    );

    const renderDatesStep = () => (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Comment souhaitez-vous définir les dates des menus ?
            </p>

            <div className="space-y-3">
                {/* Option: Utiliser les dates du fichier */}
                <label className={`
                    flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                    ${dateConfig.mode === 'from_file'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'}
                `}>
                    <input
                        type="radio"
                        name="date-mode"
                        checked={dateConfig.mode === 'from_file'}
                        onChange={() => setDateConfig(prev => ({ ...prev, mode: 'from_file' }))}
                        className="mt-1"
                    />
                    <div>
                        <p className="font-medium text-foreground">Utiliser les dates du fichier</p>
                        <p className="text-sm text-muted-foreground">
                            {dateConfig.date_format
                                ? `Format détecté : ${dateConfig.date_format}`
                                : 'Les dates seront extraites de la colonne mappée'
                            }
                        </p>
                    </div>
                </label>

                {/* Option: Aligner sur la semaine */}
                <label className={`
                    flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                    ${dateConfig.mode === 'align_week'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'}
                `}>
                    <input
                        type="radio"
                        name="date-mode"
                        checked={dateConfig.mode === 'align_week'}
                        onChange={() => setDateConfig(prev => ({ ...prev, mode: 'align_week', start_date: weekStart }))}
                        className="mt-1"
                    />
                    <div>
                        <p className="font-medium text-foreground">Aligner sur la semaine sélectionnée</p>
                        <p className="text-sm text-muted-foreground">
                            Commence le {new Date(weekStart).toLocaleDateString('fr-FR', {
                                weekday: 'long', day: 'numeric', month: 'long'
                            })}
                        </p>
                    </div>
                </label>

                {/* Option: Date de début personnalisée */}
                <label className={`
                    flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                    ${dateConfig.mode === 'start_date'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'}
                `}>
                    <input
                        type="radio"
                        name="date-mode"
                        checked={dateConfig.mode === 'start_date'}
                        onChange={() => setDateConfig(prev => ({ ...prev, mode: 'start_date' }))}
                        className="mt-1"
                    />
                    <div className="flex-1">
                        <p className="font-medium text-foreground">Spécifier une date de début</p>
                        <Input
                            type="date"
                            value={dateConfig.start_date || ''}
                            onChange={(e) => setDateConfig(prev => ({ ...prev, start_date: e.target.value }))}
                            className="mt-2 max-w-[200px]"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </label>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t">
                <input
                    type="checkbox"
                    id="skip-weekends"
                    checked={dateConfig.skip_weekends}
                    onChange={(e) => setDateConfig(prev => ({ ...prev, skip_weekends: e.target.checked }))}
                    className="rounded"
                />
                <Label htmlFor="skip-weekends" className="text-sm cursor-pointer">
                    Ignorer les week-ends (samedi et dimanche)
                </Label>
            </div>
        </div>
    );

    const renderDuplicatesStep = () => (
        <div className="space-y-6">
            {previewStats.duplicates > 0 ? (
                <>
                    <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-amber-700 dark:text-amber-400">
                                {plural(previewStats.duplicates, 'menu existe', 'menus existent')} déjà
                            </p>
                            <p className="text-sm text-amber-600 dark:text-amber-500">
                                Des menus sont déjà enregistrés pour certaines dates.
                            </p>
                        </div>
                    </div>

                    {/* Liste des doublons */}
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                        {preview.filter(m => m.has_duplicate).slice(0, 10).map((menu, idx) => (
                            <div key={idx} className="px-4 py-3 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-foreground">{menu.date_display}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {menu.existing_menu?.status === 'published' ? 'Publié' : 'Brouillon'}
                                    </p>
                                </div>
                                <FileWarning className="w-4 h-4 text-amber-500" />
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium text-green-700 dark:text-green-400">
                            Aucun doublon détecté
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-500">
                            Tous les menus seront créés comme nouveaux.
                        </p>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Action pour les doublons :</p>

                {[
                    { value: 'skip', label: 'Ignorer', desc: 'Ne pas importer ces jours' },
                    { value: 'replace', label: 'Remplacer', desc: 'Écraser les menus existants' },
                    { value: 'merge', label: 'Fusionner', desc: 'Ajouter les items aux menus existants' }
                ].map(option => (
                    <label key={option.value} className={`
                        flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                        ${duplicateAction === option.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'}
                    `}>
                        <input
                            type="radio"
                            name="duplicate-action"
                            checked={duplicateAction === option.value}
                            onChange={() => setDuplicateAction(option.value as typeof duplicateAction)}
                            className="mt-1"
                        />
                        <div>
                            <p className="font-medium text-foreground">{option.label}</p>
                            <p className="text-sm text-muted-foreground">{option.desc}</p>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );

    const renderPreviewStep = () => (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-foreground">{previewStats.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {duplicateAction === 'skip' ? previewStats.new : previewStats.total}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500">À importer</p>
                </div>
                {previewStats.duplicates > 0 && (
                    <div className="p-4 bg-amber-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                            {duplicateAction === 'skip' ? previewStats.duplicates : 0}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500">Ignorés</p>
                    </div>
                )}
            </div>

            {/* Preview des menus */}
            <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b flex items-center justify-between">
                    <p className="text-sm font-medium">Aperçu des menus</p>
                    <span className="text-xs text-muted-foreground">
                        {plural(preview.length, 'jour', 'jours')}
                    </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y">
                    {preview.map((menu, idx) => {
                        // Date formatée en français
                        const dateObj = new Date(menu.date);
                        const dateFormatted = dateObj.toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long'
                        });
                        // Capitaliser première lettre
                        const dateDisplay = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

                        return (
                            <div key={idx} className={`px-4 py-3 ${menu.has_duplicate && duplicateAction === 'skip' ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-medium text-foreground">{dateDisplay}</p>
                                    {menu.has_duplicate && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${duplicateAction === 'skip'
                                            ? 'bg-muted text-muted-foreground'
                                            : duplicateAction === 'replace'
                                                ? 'bg-amber-500/10 text-amber-600'
                                                : 'bg-blue-500/10 text-blue-600'
                                            }`}>
                                            {duplicateAction === 'skip' ? 'Ignoré' : duplicateAction === 'replace' ? 'Sera remplacé' : 'Sera fusionné'}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {menu.items.slice(0, 4).map((item, itemIdx) => (
                                        <span key={itemIdx} className="text-xs px-2 py-1 bg-muted rounded border border-border/50">
                                            {item.name}
                                            {item.tags?.some(t => t.id === 'vegetarian') && ' 🌱'}
                                        </span>
                                    ))}
                                    {menu.items.length > 4 && (
                                        <span className="text-xs text-muted-foreground flex items-center">
                                            +{menu.items.length - 4} autres
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Option auto-publish */}
            <div className="flex items-center gap-2 pt-4 border-t">
                <input
                    type="checkbox"
                    id="auto-publish"
                    checked={autoPublish}
                    onChange={(e) => setAutoPublish(e.target.checked)}
                    className="rounded"
                />
                <Label htmlFor="auto-publish" className="text-sm cursor-pointer">
                    Publier automatiquement après l'import
                </Label>
            </div>
        </div >
    );

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[90vh] bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground">Importer des menus</h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Steps indicator */}
                <div className="flex items-center justify-center gap-2 px-6 py-3 border-b border-border bg-muted/30">
                    {STEP_ORDER.map((step, index) => (
                        <div key={step} className="flex items-center">
                            <div className={`
                                flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors
                                ${index < currentStepIndex
                                    ? 'bg-primary text-primary-foreground'
                                    : index === currentStepIndex
                                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/50 ring-offset-2 ring-offset-background'
                                        : 'bg-muted text-muted-foreground'
                                }
                            `}>
                                {index < currentStepIndex ? <Check className="w-4 h-4" /> : index + 1}
                            </div>
                            <span className={`hidden sm:block ml-2 text-xs ${index === currentStepIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
                                }`}>
                                {STEP_LABELS[step]}
                            </span>
                            {index < STEP_ORDER.length - 1 && (
                                <div className={`w-8 h-0.5 mx-2 ${index < currentStepIndex ? 'bg-primary' : 'bg-border'
                                    }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    {currentStep === 'upload' && renderUploadStep()}
                    {currentStep === 'mapping' && renderMappingStep()}
                    {currentStep === 'dates' && renderDatesStep()}
                    {currentStep === 'duplicates' && renderDuplicatesStep()}
                    {currentStep === 'preview' && renderPreviewStep()}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
                    <Button
                        variant="ghost"
                        onClick={currentStepIndex === 0 ? onClose : goPrev}
                        disabled={isLoading}
                    >
                        {currentStepIndex === 0 ? 'Annuler' : (
                            <>
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Retour
                            </>
                        )}
                    </Button>

                    {currentStep === 'preview' ? (
                        <Button onClick={handleConfirmImport} disabled={isLoading || preview.length === 0}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Import en cours...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Importer ({duplicateAction === 'skip' ? previewStats.new : previewStats.total})
                                </>
                            )}
                        </Button>
                    ) : (
                        <Button onClick={goNext} disabled={!canGoNext() || isLoading}>
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : null}
                            Suivant
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
}
