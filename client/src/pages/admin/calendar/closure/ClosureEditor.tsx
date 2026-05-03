import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
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

export function ClosureEditor({ open, closure, prefillStart, prefillEnd, onClose, onSaved }: ClosureEditorProps) {
    const isEditing = !!closure;
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
        setForm(f => ({ ...f, [key]: val }));

    const handleSave = async () => {
        if (!form.start_date) { setError('La date de début est requise.'); return; }
        if (!form.isSingleDay && !form.end_date) { setError('La date de fin est requise.'); return; }
        if (!form.isSingleDay && form.end_date < form.start_date) {
            setError('La date de fin doit être après la date de début.'); return;
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

    return (
        <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Modifier la fermeture' : 'Nouvelle fermeture exceptionnelle'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Jour / Plage toggle */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => set('isSingleDay', true)}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${form.isSingleDay ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >
                            Un seul jour
                        </button>
                        <button
                            type="button"
                            onClick={() => set('isSingleDay', false)}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${!form.isSingleDay ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >
                            Plage de dates
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">
                                {form.isSingleDay ? 'Date' : 'Date de début'}
                            </label>
                            <input
                                type="date"
                                value={form.start_date}
                                onChange={e => set('start_date', e.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        {!form.isSingleDay && (
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Date de fin</label>
                                <input
                                    type="date"
                                    value={form.end_date}
                                    min={form.start_date}
                                    onChange={e => set('end_date', e.target.value)}
                                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">Motif (optionnel)</label>
                            <input
                                type="text"
                                value={form.reason}
                                onChange={e => set('reason', e.target.value)}
                                placeholder="Ex : Vacances scolaires, Travaux..."
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground block mb-1">Description (optionnel)</label>
                            <textarea
                                value={form.description}
                                onChange={e => set('description', e.target.value)}
                                placeholder="Informations complémentaires..."
                                rows={3}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            />
                        </div>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter className="gap-2">
                    {isEditing && (
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={busy}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto"
                        >
                            <Trash2 className="w-4 h-4 mr-1.5" />
                            Supprimer
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Annuler
                    </Button>
                    <Button onClick={handleSave} disabled={busy}>
                        {isSaving ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                </DialogFooter>
            </DialogContent>

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
        </Dialog>
    );
}
