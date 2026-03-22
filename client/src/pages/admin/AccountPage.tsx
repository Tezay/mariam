/**
 * MARIAM - Page Mon Compte
 *
 * Affiche les informations du compte et permet de gérer la sécurité :
 * - TOTP (application d'authentification)
 * - Passkeys (Touch ID, Face ID, Windows Hello)
 * - Changement de mot de passe (TOTP ou passkey selon ce qui est disponible)
 */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { usePwaInstall } from '@/contexts/PwaInstallContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Mail, Shield, Calendar, Clock, Key, AlertCircle, Check, Fingerprint, Smartphone } from 'lucide-react';
import { PasskeyManager } from '@/components/PasskeyManager';
import { TotpManager } from '@/components/TotpManager';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

// ─── PWA Install Section ──────────────────────────────────────────────────────

function AppInstallSection() {
    const { isInstalled } = usePwaInstall();

    return (
        <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                Application
            </h2>

            {isInstalled ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                    <div>
                        <p className="font-medium text-green-800 dark:text-green-300">Application installée</p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                            Mariam — Gestion est installée sur cet appareil.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Installez Mariam sur votre appareil pour un accès rapide sans passer par le navigateur.
                    </p>
                    <Button
                        onClick={() => { window.location.href = '/admin/install'; }}
                        className="gap-2"
                    >
                        <Smartphone className="w-4 h-4" />
                        Installer l'application
                    </Button>
                </div>
            )}
        </section>
    );
}

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrateur',
    editor: 'Éditeur',
    reader: 'Lecteur',
};

type VerificationMethod = 'totp' | 'passkey';

export function AccountPage() {
    const { user } = useAuth();

    const hasMfa = user?.mfa_enabled ?? false;
    const hasPasskeys = (user?.passkeys_count ?? 0) > 0;
    const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

    // Méthode de vérification disponible : TOTP en priorité si actif
    const defaultMethod: VerificationMethod = hasMfa ? 'totp' : 'passkey';
    const canUseBoth = hasMfa && hasPasskeys && passkeySupported;

    // États du formulaire de changement de mot de passe
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>(defaultMethod);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const resetForm = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setMfaCode('');
        setVerificationMethod(hasMfa ? 'totp' : 'passkey');
        setMessage(null);
    };

    const validatePasswords = (): string | null => {
        if (newPassword !== confirmPassword) return 'Les mots de passe ne correspondent pas';
        if (newPassword.length < 12) return 'Le mot de passe doit contenir au moins 12 caractères';
        return null;
    };

    // Changement de mot de passe via TOTP
    const handleChangeWithTotp = async (e: React.FormEvent) => {
        e.preventDefault();
        const validationError = validatePasswords();
        if (validationError) { setMessage({ type: 'error', text: validationError }); return; }
        if (mfaCode.length !== 6) { setMessage({ type: 'error', text: 'Le code doit contenir 6 chiffres' }); return; }

        setIsSubmitting(true);
        setMessage(null);
        try {
            await authApi.changePassword(currentPassword, newPassword, mfaCode);
            setMessage({ type: 'success', text: 'Mot de passe modifié avec succès' });
            resetForm();
            setTimeout(() => { setIsDialogOpen(false); setMessage(null); }, 2000);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string; message?: string } } };
            setMessage({
                type: 'error',
                text: error.response?.data?.message || error.response?.data?.error || 'Erreur lors du changement',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Changement de mot de passe via passkey (2 étapes intégrées dans le dialog)
    const handleChangeWithPasskey = async (e: React.FormEvent) => {
        e.preventDefault();
        const validationError = validatePasswords();
        if (validationError) { setMessage({ type: 'error', text: validationError }); return; }

        setIsSubmitting(true);
        setMessage(null);
        try {
            // Étape 1 : valider le mot de passe actuel côté serveur + obtenir le challenge
            const { options, challenge_token } = await authApi.passkeyChangePasswordBegin(currentPassword);

            // Étape 2 : vérification biométrique
            const credential = await startAuthentication({
                optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
            });

            // Étape 3 : appliquer le nouveau mot de passe
            await authApi.passkeyChangePasswordComplete(newPassword, challenge_token, credential);

            setMessage({ type: 'success', text: 'Mot de passe modifié avec succès' });
            resetForm();
            setTimeout(() => { setIsDialogOpen(false); setMessage(null); }, 2000);
        } catch (err: unknown) {
            const error = err as {
                name?: string;
                response?: { data?: { error?: string; message?: string } };
            };
            if (error.name === 'NotAllowedError') {
                setMessage({ type: 'error', text: 'Authentification annulée. Réessayez.' });
            } else {
                setMessage({
                    type: 'error',
                    text: error.response?.data?.message || error.response?.data?.error || 'Erreur lors du changement',
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Non disponible';
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="container-mariam py-8">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* En-tête */}
                <div>
                    <h1 className="text-3xl font-bold text-foreground">
                        {user?.username || user?.email || 'Mon Compte'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gérez vos informations personnelles et votre sécurité.
                    </p>
                </div>

                {/* Informations du compte */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                        Informations du compte
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                            <Mail className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-medium text-foreground break-all">{user?.email}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                            <Shield className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <p className="text-sm text-muted-foreground">Rôle</p>
                                <p className="font-medium text-foreground capitalize">
                                    {ROLE_LABELS[user?.role || ''] || user?.role}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                            <Calendar className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <p className="text-sm text-muted-foreground">Activation du compte</p>
                                <p className="font-medium text-foreground">
                                    {formatDate(user?.created_at || null)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                            <Clock className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <p className="text-sm text-muted-foreground">Dernière connexion</p>
                                <p className="font-medium text-foreground">
                                    {formatDate(user?.last_login || null)}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Sécurité */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                        Sécurité
                    </h2>

                    {/* TOTP */}
                    <TotpManager />

                    {/* Passkeys */}
                    <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                        <div className="flex items-center gap-2">
                            <Fingerprint className="w-5 h-5 text-primary shrink-0" />
                            <div>
                                <p className="font-medium text-foreground">Passkeys (Touch ID, Face ID…)</p>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Connectez-vous sans code, avec votre empreinte digitale ou visage.
                                </p>
                            </div>
                        </div>
                        <PasskeyManager />
                    </div>

                    {/* Mot de passe */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-card gap-4">
                        <div>
                            <p className="font-medium text-foreground">Mot de passe</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Changez régulièrement votre mot de passe pour sécuriser votre compte.
                            </p>
                        </div>

                        <Dialog
                            open={isDialogOpen}
                            onOpenChange={(open) => {
                                setIsDialogOpen(open);
                                if (!open) resetForm();
                            }}
                        >
                            <DialogTrigger asChild>
                                <Button variant="outline" className="gap-2 shrink-0">
                                    <Key className="w-4 h-4" />
                                    Modifier
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Modifier le mot de passe</DialogTitle>
                                    <DialogDescription>
                                        {canUseBoth
                                            ? 'Entrez vos mots de passe, puis choisissez comment vérifier votre identité.'
                                            : hasMfa
                                                ? 'Entrez votre mot de passe actuel, le nouveau, et le code de votre application.'
                                                : 'Entrez votre mot de passe actuel et le nouveau, puis confirmez avec votre appareil.'}
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

                                {/* Champs communs aux deux méthodes */}
                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="currentPassword">Mot de passe actuel</Label>
                                        <Input
                                            id="currentPassword"
                                            type="password"
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="newPassword">Nouveau mot de passe</Label>
                                        <Input
                                            id="newPassword"
                                            type="password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                            minLength={12}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Min. 12 caractères, majuscule, minuscule, chiffre, symbole.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPassword">Confirmer</Label>
                                        <Input
                                            id="confirmPassword"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Sélecteur de méthode de vérification (si les deux sont disponibles) */}
                                {canUseBoth && (
                                    <div className="flex rounded-lg border border-border overflow-hidden text-sm">
                                        <button
                                            type="button"
                                            onClick={() => setVerificationMethod('totp')}
                                            className={`flex-1 px-3 py-2 transition-colors ${
                                                verificationMethod === 'totp'
                                                    ? 'bg-primary text-primary-foreground font-medium'
                                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
                                            }`}
                                        >
                                            Code application
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setVerificationMethod('passkey')}
                                            className={`flex-1 px-3 py-2 transition-colors border-l border-border ${
                                                verificationMethod === 'passkey'
                                                    ? 'bg-primary text-primary-foreground font-medium'
                                                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
                                            }`}
                                        >
                                            Cet appareil
                                        </button>
                                    </div>
                                )}

                                {/* Vérification TOTP */}
                                {(hasMfa && (!canUseBoth || verificationMethod === 'totp')) && (
                                    <form onSubmit={handleChangeWithTotp} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="mfaCode">Code à 6 chiffres</Label>
                                            <Input
                                                id="mfaCode"
                                                value={mfaCode}
                                                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                placeholder="000000"
                                                maxLength={6}
                                                inputMode="numeric"
                                                className="font-mono tracking-widest text-center text-lg"
                                                required
                                            />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                                                Annuler
                                            </Button>
                                            <Button type="submit" disabled={isSubmitting || mfaCode.length !== 6}>
                                                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                                            </Button>
                                        </div>
                                    </form>
                                )}

                                {/* Vérification passkey */}
                                {(hasPasskeys && passkeySupported && (!hasMfa || verificationMethod === 'passkey')) && (
                                    <form onSubmit={handleChangeWithPasskey} className="space-y-4">
                                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                                            <Fingerprint className="w-4 h-4 text-primary shrink-0" />
                                            Votre appareil vous demandera de confirmer votre identité.
                                        </p>
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                                                Annuler
                                            </Button>
                                            <Button
                                                type="submit"
                                                disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
                                                className="gap-2"
                                            >
                                                <Fingerprint className="w-4 h-4" />
                                                {isSubmitting ? 'Vérification…' : 'Confirmer avec cet appareil'}
                                            </Button>
                                        </div>
                                    </form>
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>
                </section>

                {/* Application — installation PWA (admin/editor uniquement) */}
                {(user?.role === 'admin' || user?.role === 'editor') && (
                    <AppInstallSection />
                )}
            </div>
        </div>
    );
}
