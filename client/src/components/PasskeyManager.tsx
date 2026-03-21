/**
 * MARIAM - Gestionnaire de Passkeys
 *
 * Permet à l'utilisateur d'enregistrer, lister et supprimer ses passkeys WebAuthn.
 *
 * Contrainte : impossible de supprimer la dernière passkey si le TOTP n'est pas actif
 * (l'utilisateur doit toujours avoir au moins une méthode 2FA active).
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authApi, type PasskeyInfo } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { Fingerprint, Trash2, Plus, AlertCircle, Check, Pencil, X } from 'lucide-react';

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Jamais';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export function PasskeyManager() {
    const { user, refreshUser } = useAuth();
    const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRegistering, setIsRegistering] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deviceName, setDeviceName] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [renameError, setRenameError] = useState<string | null>(null);

    const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;
    const mfaEnabled = user?.mfa_enabled ?? false;

    const loadPasskeys = useCallback(async () => {
        try {
            const list = await authApi.listPasskeys();
            setPasskeys(list);
        } catch {
            // silencieux
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPasskeys();
    }, [loadPasskeys]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsRegistering(true);

        try {
            const { options, challenge_token } = await authApi.passkeyRegisterBegin();
            const credential = await startRegistration({
                optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
            });
            await authApi.passkeyRegisterComplete(challenge_token, credential, deviceName.trim() || undefined);

            setMessage({ type: 'success', text: 'Passkey enregistrée avec succès !' });
            setDeviceName('');
            await loadPasskeys();
            await refreshUser();

            setTimeout(() => {
                setDialogOpen(false);
                setMessage(null);
            }, 1500);
        } catch (err: unknown) {
            const error = err as { name?: string; response?: { data?: { error?: string } } };
            if (error.name === 'NotAllowedError') {
                setMessage({ type: 'error', text: 'Enregistrement annulé' });
            } else {
                setMessage({
                    type: 'error',
                    text: error.response?.data?.error || "Échec de l'enregistrement de la passkey",
                });
            }
        } finally {
            setIsRegistering(false);
        }
    };

    const handleRenameStart = (pk: PasskeyInfo) => {
        setRenameError(null);
        setEditingId(pk.id);
        setEditingName(pk.device_name || '');
    };

    const handleRenameCancel = () => {
        setEditingId(null);
        setEditingName('');
        setRenameError(null);
    };

    const handleRenameConfirm = async (pk: PasskeyInfo) => {
        const trimmed = editingName.trim();
        if (!trimmed) { setRenameError('Le nom ne peut pas être vide'); return; }
        try {
            await authApi.renamePasskey(pk.id, trimmed);
            setPasskeys((prev) => prev.map((p) => p.id === pk.id ? { ...p, device_name: trimmed } : p));
            setEditingId(null);
            setEditingName('');
            setRenameError(null);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setRenameError(error.response?.data?.error || 'Erreur lors du renommage');
        }
    };

    const handleDelete = async (passkey: PasskeyInfo) => {
        if (editingId === passkey.id) handleRenameCancel();
        setDeleteError(null);

        // Vérification locale avant l'appel réseau
        if (passkeys.length === 1 && !mfaEnabled) {
            setDeleteError(
                "Impossible de supprimer la dernière passkey sans authentification par code active. " +
                "Activez d'abord l'authentification par code."
            );
            return;
        }

        if (!confirm(`Supprimer la passkey « ${passkey.device_name || 'cet appareil'} » ?`)) return;

        try {
            await authApi.deletePasskey(passkey.id);
            setPasskeys((prev) => prev.filter((p) => p.id !== passkey.id));
            await refreshUser();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setDeleteError(error.response?.data?.error || 'Erreur lors de la suppression');
        }
    };

    if (!passkeySupported) {
        return (
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
                Les passkeys ne sont pas supportées par ce navigateur.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Erreur de suppression */}
            {deleteError && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-destructive/10 text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{deleteError}</span>
                </div>
            )}

            {/* Liste des passkeys */}
            {isLoading ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : passkeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune passkey enregistrée.</p>
            ) : (
                <ul className="space-y-2">
                    {passkeys.map((pk) => {
                        const isLastAndNoTotp = passkeys.length === 1 && !mfaEnabled;
                        const isEditing = editingId === pk.id;
                        return (
                            <li
                                key={pk.id}
                                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 gap-3"
                            >
                                <Fingerprint className="w-5 h-5 text-primary shrink-0" />

                                {isEditing ? (
                                    <div className="flex-1 flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <Input
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameConfirm(pk);
                                                    if (e.key === 'Escape') handleRenameCancel();
                                                }}
                                                maxLength={100}
                                                autoFocus
                                                className="h-7 text-sm py-0"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0 text-green-600 hover:text-green-700"
                                                onClick={() => handleRenameConfirm(pk)}
                                                title="Confirmer"
                                            >
                                                <Check className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                                onClick={handleRenameCancel}
                                                title="Annuler"
                                            >
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        {renameError && (
                                            <p className="text-xs text-destructive">{renameError}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">
                                            {pk.device_name || 'Appareil sans nom'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Ajoutée le {formatDate(pk.created_at)}
                                            {pk.last_used_at && ` · Utilisée le ${formatDate(pk.last_used_at)}`}
                                        </p>
                                    </div>
                                )}

                                {!isEditing && (
                                    <div className="flex items-center shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-foreground"
                                            onClick={() => handleRenameStart(pk)}
                                            title="Renommer cette passkey"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={isLastAndNoTotp
                                                ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                                                : 'text-muted-foreground hover:text-destructive'
                                            }
                                            onClick={() => handleDelete(pk)}
                                            title={
                                                isLastAndNoTotp
                                                    ? "Activez l'authentification par code pour pouvoir supprimer"
                                                    : 'Supprimer cette passkey'
                                            }
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Bouton d'ajout */}
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    setMessage(null);
                    setDeviceName('');
                }}
            >
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Plus className="w-4 h-4" />
                        Ajouter une passkey
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Enregistrer une passkey</DialogTitle>
                        <DialogDescription>
                            Votre appareil (Touch ID, Face ID, Windows Hello…) sera utilisé pour
                            vous authentifier.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleRegister} className="space-y-4 mt-2">
                        {message && (
                            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                                message.type === 'success'
                                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                    : 'bg-destructive/10 text-destructive'
                            }`}>
                                {message.type === 'success'
                                    ? <Check className="w-4 h-4 shrink-0" />
                                    : <AlertCircle className="w-4 h-4 shrink-0" />
                                }
                                {message.text}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="deviceName">
                                Nom de l'appareil{' '}
                                <span className="text-muted-foreground">(optionnel)</span>
                            </Label>
                            <Input
                                id="deviceName"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                placeholder="ex : MacBook Pro, iPhone 15…"
                                maxLength={100}
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                                Annuler
                            </Button>
                            <Button type="submit" disabled={isRegistering} className="gap-2">
                                <Fingerprint className="w-4 h-4" />
                                {isRegistering ? 'En attente…' : 'Enregistrer'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
