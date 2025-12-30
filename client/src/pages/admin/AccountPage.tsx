/**
 * MARIAM - Page Mon Compte
 * 
 * Affiche les informations du compte et permet de changer le mot de passe.
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
    DialogTrigger,
} from "@/components/ui/dialog";
import { Mail, Shield, Calendar, Clock, Key, AlertCircle, Check, Info } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrateur',
    editor: 'Éditeur',
    reader: 'Lecteur'
};

export function AccountPage() {
    const { user } = useAuth();

    // États pour le changement de mot de passe
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        // Validation
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas' });
            return;
        }

        if (newPassword.length < 12) {
            setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 12 caractères' });
            return;
        }

        if (mfaCode.length !== 6) {
            setMessage({ type: 'error', text: 'Le code MFA doit contenir 6 chiffres' });
            return;
        }

        setIsSubmitting(true);

        try {
            await authApi.changePassword(currentPassword, newPassword, mfaCode);
            setMessage({ type: 'success', text: 'Mot de passe modifié avec succès' });
            // Reset form
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setMfaCode('');
            setTimeout(() => {
                setIsDialogOpen(false);
                setMessage(null);
            }, 2000);
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string; message?: string } } };
            setMessage({
                type: 'error',
                text: err.response?.data?.message || err.response?.data?.error || 'Erreur lors du changement de mot de passe'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Non disponible';
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="container-mariam py-8">
            <div className="max-w-3xl mx-auto space-y-8">

                {/* En-tête personnalisé */}
                <div>
                    <h1 className="text-3xl font-bold text-foreground">
                        {user?.username || user?.email || 'Mon Compte'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gérez vos informations personnelles et votre sécurité.
                    </p>
                </div>

                {/* Informations du compte - grille simple */}
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
                                <p className="text-sm text-muted-foreground">Membre depuis</p>
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

                {/* Section Sécurité */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
                        Sécurité
                    </h2>

                    {/* MFA Status */}
                    <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                        <div>
                            <p className="font-medium text-foreground">Authentification multifacteur (MFA)</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Protège votre compte avec un code temporaire lors de la connexion.
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium shrink-0 ${user?.mfa_enabled
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                : 'bg-destructive/10 text-destructive'
                            }`}>
                            {user?.mfa_enabled ? 'Activé' : 'Désactivé'}
                        </span>
                    </div>

                    {/* Mot de passe */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-card gap-4">
                        <div>
                            <p className="font-medium text-foreground">Mot de passe</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Changez régulièrement votre mot de passe pour sécuriser votre compte.
                            </p>
                        </div>

                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                                        Entrez votre mot de passe actuel, le nouveau, et un code MFA.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="bg-primary/5 border border-primary/20 p-3 rounded-md flex items-start gap-3 text-sm">
                                    <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                    <p className="text-muted-foreground">
                                        <span className="font-medium text-foreground">MFA requis : </span>
                                        Entrez le code à 6 chiffres de votre application d'authentification.
                                    </p>
                                </div>

                                <form onSubmit={handleChangePassword} className="space-y-4 mt-2">
                                    {message && (
                                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${message.type === 'success'
                                                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                                : 'bg-destructive/10 text-destructive'
                                            }`}>
                                            {message.type === 'success'
                                                ? <Check className="w-4 h-4" />
                                                : <AlertCircle className="w-4 h-4" />
                                            }
                                            {message.text}
                                        </div>
                                    )}

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

                                    <div className="space-y-2">
                                        <Label htmlFor="mfaCode">Code MFA</Label>
                                        <Input
                                            id="mfaCode"
                                            value={mfaCode}
                                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                                            placeholder="000000"
                                            maxLength={6}
                                            className="font-mono tracking-widest text-center text-lg"
                                            required
                                        />
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                                            Annuler
                                        </Button>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                </section>
            </div>
        </div>
    );
}
