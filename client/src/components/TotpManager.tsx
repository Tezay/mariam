/**
 * MARIAM - Gestionnaire TOTP
 *
 * Permet d'ajouter ou de supprimer l'authentification par code (TOTP)
 * depuis les paramètres du compte.
 *
 * Contrainte : impossible de désactiver si aucune passkey n'est enregistrée
 * (l'utilisateur doit toujours avoir au moins une méthode 2FA active).
 */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ShieldCheck, ShieldOff, AlertCircle, Check, Smartphone } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

type DialogMode = 'setup' | 'disable';

export function TotpManager() {
    const { user, refreshUser } = useAuth();

    const [dialogMode, setDialogMode] = useState<DialogMode>('setup');
    const [dialogOpen, setDialogOpen] = useState(false);

    // Setup flow
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [setupStep, setSetupStep] = useState<'qr' | 'verify'>('qr');
    const [code, setCode] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const mfaEnabled = user?.mfa_enabled ?? false;
    const passkeysCount = user?.passkeys_count ?? 0;
    const canDisable = passkeysCount > 0;

    const openSetup = async () => {
        setMessage(null);
        setCode('');
        setSetupStep('qr');
        setDialogMode('setup');
        setIsLoading(true);
        setDialogOpen(true);

        try {
            const data = await authApi.mfaSetupBegin();
            setQrCode(data.qr_code);
            setSecret(data.secret);
        } catch {
            setMessage({ type: 'error', text: 'Impossible de générer le QR code. Réessayez.' });
        } finally {
            setIsLoading(false);
        }
    };

    const openDisable = () => {
        setMessage(null);
        setDialogMode('disable');
        setDialogOpen(true);
    };

    const closeDialog = () => {
        setDialogOpen(false);
        setMessage(null);
        setCode('');
        setQrCode('');
        setSecret('');
        setSetupStep('qr');
    };

    const handleSetupConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsLoading(true);

        try {
            await authApi.mfaSetupConfirm(code);
            await refreshUser();
            setMessage({ type: 'success', text: 'Authentification par code activée !' });
            setTimeout(closeDialog, 1500);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setMessage({
                type: 'error',
                text: error.response?.data?.error || 'Code invalide. Réessayez.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisableConfirm = async () => {
        setMessage(null);
        setIsLoading(true);

        try {
            await authApi.disableMfa();
            await refreshUser();
            setMessage({ type: 'success', text: 'Authentification par code désactivée.' });
            setTimeout(closeDialog, 1500);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setMessage({
                type: 'error',
                text: error.response?.data?.error || 'Impossible de désactiver. Réessayez.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium text-foreground">Application d'authentification</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Codes à 6 chiffres via Google Authenticator, Microsoft Authenticator, etc.
                        </p>
                        <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                            mfaEnabled
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                : 'bg-muted text-muted-foreground'
                        }`}>
                            {mfaEnabled ? (
                                <><ShieldCheck className="w-3 h-3" /> Actif</>
                            ) : (
                                <><ShieldOff className="w-3 h-3" /> Inactif</>
                            )}
                        </span>
                    </div>
                </div>

                <div className="shrink-0 ml-4">
                    {mfaEnabled ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span tabIndex={!canDisable ? 0 : undefined} className="inline-flex">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={canDisable ? openDisable : undefined}
                                            disabled={!canDisable}
                                            className={!canDisable ? 'pointer-events-none opacity-50' : ''}
                                        >
                                            Désactiver
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                {!canDisable && (
                                    <TooltipContent side="left">
                                        <p className="flex items-center gap-1.5">
                                            <AlertCircle className="w-3 h-3 shrink-0" />
                                            Enregistrez d'abord une passkey pour désactiver.
                                        </p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <Button variant="outline" size="sm" onClick={openSetup}>
                            Configurer
                        </Button>
                    )}
                </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                <DialogContent className="sm:max-w-sm">

                    {/* ── Dialog : Setup ─────────────────────────── */}
                    {dialogMode === 'setup' && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Configurer l'application d'authentification</DialogTitle>
                                <DialogDescription>
                                    Scannez le QR code avec votre application, puis entrez le code
                                    affiché pour confirmer.
                                </DialogDescription>
                            </DialogHeader>

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

                            {isLoading && !qrCode ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                                </div>
                            ) : (
                                <>
                                    {setupStep === 'qr' && qrCode && (
                                        <div className="space-y-4">
                                            <div className="flex justify-center">
                                                <img
                                                    src={qrCode}
                                                    alt="QR Code TOTP"
                                                    className="w-44 h-44 border border-border rounded"
                                                />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-muted-foreground mb-1">
                                                    Ou entrez cette clé manuellement :
                                                </p>
                                                <code className="bg-muted px-3 py-1 rounded text-sm font-mono text-foreground break-all">
                                                    {secret}
                                                </code>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-1">
                                                <Button variant="ghost" onClick={closeDialog}>Annuler</Button>
                                                <Button onClick={() => setSetupStep('verify')}>
                                                    J'ai scanné le code →
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {setupStep === 'verify' && (
                                        <form onSubmit={handleSetupConfirm} className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="totpCode">Code de vérification</Label>
                                                <Input
                                                    id="totpCode"
                                                    value={code}
                                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    placeholder="000000"
                                                    maxLength={6}
                                                    inputMode="numeric"
                                                    autoFocus
                                                    className="font-mono tracking-widest text-center text-lg"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Entrez le code affiché dans votre application.
                                                </p>
                                            </div>
                                            <div className="flex justify-between gap-2 pt-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setSetupStep('qr')}
                                                >
                                                    ← Retour
                                                </Button>
                                                <div className="flex gap-2">
                                                    <Button variant="ghost" type="button" onClick={closeDialog}>
                                                        Annuler
                                                    </Button>
                                                    <Button
                                                        type="submit"
                                                        disabled={isLoading || code.length !== 6}
                                                    >
                                                        {isLoading ? 'Vérification…' : 'Activer'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </form>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* ── Dialog : Disable ───────────────────────── */}
                    {dialogMode === 'disable' && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Désactiver l'authentification par code</DialogTitle>
                                <DialogDescription>
                                    Vous ne serez plus invité à entrer un code lors de la connexion
                                    par mot de passe. Votre passkey reste active.
                                </DialogDescription>
                            </DialogHeader>

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

                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="ghost" onClick={closeDialog} disabled={isLoading}>
                                    Annuler
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleDisableConfirm}
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Désactivation…' : 'Désactiver'}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
