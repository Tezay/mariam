import { useState } from 'react';
import { menusApi } from '@/lib/api';
import type { Menu } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';

interface ImportFromDayPanelProps {
    open: boolean;
    targetDate: string;
    restaurantId: number | undefined;
    onClose: () => void;
    onImported: () => void;
}

export function ImportFromDayPanel({ open, targetDate, restaurantId, onClose, onImported }: ImportFromDayPanelProps) {
    const [sourceDate, setSourceDate] = useState('');
    const [preview, setPreview] = useState<Menu | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePreview = async () => {
        if (!sourceDate) { setError('Choisissez une date source.'); return; }
        setIsPreviewing(true);
        setError(null);
        try {
            const menu = await menusApi.getByDate(sourceDate, restaurantId);
            if (!menu) { setError('Aucun menu trouvé pour cette date.'); setPreview(null); return; }
            setPreview(menu as Menu);
        } catch {
            setError('Impossible de charger le menu source.');
            setPreview(null);
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleImport = async () => {
        if (!preview) return;
        setIsImporting(true);
        setError(null);
        try {
            await menusApi.save(targetDate, preview.items ?? [], restaurantId ?? undefined);
            onImported();
        } catch {
            setError('Erreur lors de l\'import.');
        } finally {
            setIsImporting(false);
        }
    };

    const reset = () => {
        setSourceDate('');
        setPreview(null);
        setError(null);
    };

    return (
        <Sheet open={open} onOpenChange={o => { if (!o) { reset(); onClose(); } }}>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
                <SheetHeader>
                    <SheetTitle>Importer depuis un autre jour</SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">Date source</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={sourceDate}
                                max={undefined}
                                onChange={e => { setSourceDate(e.target.value); setPreview(null); setError(null); }}
                                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePreview}
                                disabled={!sourceDate || isPreviewing}
                                className="rounded-xl"
                            >
                                {isPreviewing ? '…' : 'Prévisualiser'}
                            </Button>
                        </div>
                    </div>

                    {preview && (
                        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                            <p className="text-xs font-semibold text-foreground">
                                {(preview.items ?? []).length} plat{(preview.items?.length ?? 0) > 1 ? 's' : ''} trouvé{(preview.items?.length ?? 0) > 1 ? 's' : ''}
                            </p>
                            <ul className="space-y-0.5">
                                {(preview.items ?? []).map((item, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                                        {item.name}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <SheetFooter className="gap-2">
                    <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Annuler</Button>
                    <Button onClick={handleImport} disabled={!preview || isImporting}>
                        {isImporting ? 'Import…' : 'Importer'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
