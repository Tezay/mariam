/**
 * MARIAM - Page d'activation de compte
 * 
 * Permet de :
 * 1. Créer un mot de passe fort
 * 2. Configurer le MFA (scan QR code)
 * 3. Confirmer avec un code TOTP
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';

type Step = 'loading' | 'invalid' | 'password' | 'mfa' | 'verify';

export function Activate() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    // État global
    const [step, setStep] = useState<Step>('loading');
    const [linkInfo, setLinkInfo] = useState<{
        link_type: string;
        email?: string;
        role: string;
    } | null>(null);

    // Formulaire mot de passe
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // MFA
    const [qrCode, setQrCode] = useState('');
    const [mfaSecret, setMfaSecret] = useState('');
    const [userId, setUserId] = useState<number>(0);
    const [mfaCode, setMfaCode] = useState('');

    // UI
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Vérifier le lien au chargement
    useEffect(() => {
        const checkLink = async () => {
            if (!token) {
                setStep('invalid');
                return;
            }

            try {
                const data = await authApi.checkActivationLink(token);
                if (data.valid) {
                    setLinkInfo(data);
                    setEmail(data.email || '');
                    setStep('password');
                } else {
                    setStep('invalid');
                }
            } catch {
                setStep('invalid');
            }
        };

        checkLink();
    }, [token]);

    // Validation du mot de passe
    const validatePassword = (pwd: string) => {
        const errors: string[] = [];
        if (pwd.length < 12) errors.push('Au moins 12 caractères');
        if (!/[A-Z]/.test(pwd)) errors.push('Une majuscule');
        if (!/[a-z]/.test(pwd)) errors.push('Une minuscule');
        if (!/\d/.test(pwd)) errors.push('Un chiffre');
        if (!/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'`~]/.test(pwd)) errors.push('Un caractère spécial');
        return errors;
    };

    const passwordErrors = validatePassword(password);
    const passwordsMatch = password === confirmPassword;

    // Soumission du mot de passe
    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (passwordErrors.length > 0 || !passwordsMatch) {
            setError('Veuillez corriger les erreurs ci-dessus');
            return;
        }

        setIsLoading(true);

        try {
            const result = await authApi.activate(token!, password, email, username);

            if (result.mfa_setup) {
                setQrCode(result.mfa_setup.qr_code);
                setMfaSecret(result.mfa_setup.secret);
                setUserId(result.mfa_setup.user_id);
                setStep('mfa');
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string; message?: string } } };
            setError(error.response?.data?.message || error.response?.data?.error || 'Erreur lors de l\'activation');
        } finally {
            setIsLoading(false);
        }
    };

    // Confirmation MFA
    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await authApi.verifyMfaSetup(userId, mfaCode);
            navigate('/admin');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setError(error.response?.data?.error || 'Code invalide');
        } finally {
            setIsLoading(false);
        }
    };

    // Rendu selon l'étape
    if (step === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (step === 'invalid') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <div className="max-w-md w-full text-center">
                    <div className="bg-card border border-border shadow-lg rounded-lg p-8">
                        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold mb-2 text-foreground">Lien invalide</h2>
                        <p className="text-muted-foreground">
                            Ce lien d'activation est invalide ou a expiré.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
            <div className="max-w-md w-full space-y-8">
                {/* Header */}
                <div className="text-center flex flex-col items-center">
                    <Logo className="h-20 w-auto" />
                    <p className="mt-4 text-muted-foreground">
                        {linkInfo?.link_type === 'first_admin'
                            ? 'Configuration du premier administrateur'
                            : 'Activation de votre compte'}
                    </p>
                </div>

                <div className="bg-card border border-border shadow-lg rounded-lg p-8">
                    {step === 'password' && (
                        <form onSubmit={handlePasswordSubmit} className="space-y-6">
                            <div>
                                <Label htmlFor="email">Adresse email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={!!linkInfo?.email}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="username">Nom d'affichage (optionnel)</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Jean Dupont"
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label htmlFor="password">Mot de passe</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="mt-1"
                                />
                                {password && passwordErrors.length > 0 && (
                                    <div className="mt-2 text-sm">
                                        <p className="text-muted-foreground mb-1">Le mot de passe doit contenir :</p>
                                        <ul className="space-y-1">
                                            {passwordErrors.map((err, i) => (
                                                <li key={i} className="text-destructive flex items-center gap-1">
                                                    <span>✗</span> {err}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="mt-1"
                                />
                                {confirmPassword && !passwordsMatch && (
                                    <p className="mt-1 text-sm text-destructive">
                                        Les mots de passe ne correspondent pas
                                    </p>
                                )}
                            </div>

                            {error && (
                                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading || passwordErrors.length > 0 || !passwordsMatch}
                            >
                                {isLoading ? 'Création...' : 'Créer mon compte'}
                            </Button>
                        </form>
                    )}

                    {step === 'mfa' && (
                        <form onSubmit={handleMfaSubmit} className="space-y-6">
                            <div className="text-center">
                                <h2 className="text-lg font-semibold mb-2 text-foreground">
                                    Configuration de l'authentification
                                </h2>
                                <p className="text-muted-foreground text-sm">
                                    Scannez ce QR code avec votre application d'authentification
                                    (Google Authenticator, Microsoft Authenticator, etc.)
                                </p>
                            </div>

                            {/* QR Code */}
                            <div className="flex justify-center">
                                <img
                                    src={qrCode}
                                    alt="QR Code MFA"
                                    className="w-48 h-48 border border-border rounded"
                                />
                            </div>

                            {/* Clé manuelle */}
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-1">
                                    Ou entrez cette clé manuellement :
                                </p>
                                <code className="bg-muted px-3 py-1 rounded text-sm font-mono text-foreground">
                                    {mfaSecret}
                                </code>
                            </div>

                            <div>
                                <Label htmlFor="mfaCode">
                                    Code de vérification
                                </Label>
                                <Input
                                    id="mfaCode"
                                    type="text"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    required
                                    className="mt-1 text-center text-2xl tracking-widest"
                                    maxLength={6}
                                />
                                <p className="mt-1 text-xs text-muted-foreground text-center">
                                    Entrez le code à 6 chiffres affiché dans votre application
                                </p>
                            </div>

                            {error && (
                                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading || mfaCode.length !== 6}
                            >
                                {isLoading ? 'Vérification...' : 'Activer mon compte'}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
