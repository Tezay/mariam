/**
 * MARIAM - Page de connexion
 *
 * Deux modes selon la compatibilité du navigateur :
 *
 * Mode passkey-first (navigateurs modernes) :
 *   → Bouton "Se connecter avec cet appareil" (empreinte / Face ID / Windows Hello)
 *   → Lien secondaire "Se connecter avec mon mot de passe"
 *
 * Mode password (fallback) :
 *   → Email + mot de passe
 *   → Si MFA TOTP activé : étape code à 6 chiffres
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

type LoginMode = 'passkey-first' | 'password' | 'mfa';

export function Login() {
    const navigate = useNavigate();
    const { login, verifyMfa, loginWithPasskey } = useAuth();

    const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;
    const [mode, setMode] = useState<LoginMode>(passkeySupported ? 'passkey-first' : 'password');

    // Formulaire email/password
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Étape MFA
    const [mfaToken, setMfaToken] = useState('');
    const [mfaCode, setMfaCode] = useState('');

    // UI
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // ── Connexion par passkey (mode passkey-first) ──────────────────────────
    const handlePasskeyLogin = async () => {
        setError('');
        setIsLoading(true);

        try {
            const { options, challenge_token } = await authApi.passkeyLoginBegin();
            const credential = await startAuthentication({
                optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
            });
            await loginWithPasskey(challenge_token, credential);
            window.umami?.track('login-success', { method: 'passkey' });
            navigate('/admin');
        } catch (err: unknown) {
            const error = err as {
                name?: string;
                response?: { status?: number; data?: { error?: string } };
            };
            window.umami?.track('login-failure', { method: 'passkey' });
            if (error.name === 'NotAllowedError') {
                setError('Authentification annulée ou expirée. Réessayez.');
            } else if (error.response?.status === 404) {
                setError('Aucune passkey trouvée. Connectez-vous avec votre mot de passe.');
            } else {
                setError(error.response?.data?.error || "Échec de l'authentification.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ── Connexion email + password ──────────────────────────────────────────
    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const result = await login(email, password);

            if (result.mfaRequired && result.mfaToken) {
                setMfaToken(result.mfaToken);
                setMode('mfa');
            } else {
                window.umami?.track('login-success', { method: 'password' });
                navigate('/admin');
            }
        } catch (err: unknown) {
            const error = err as {
                response?: { data?: { error?: string; passkey_only?: boolean } };
            };
            window.umami?.track('login-failure', { method: 'password' });
            if (error.response?.data?.passkey_only) {
                setError(
                    'Ce compte utilise la connexion par passkey. ' +
                    'Veuillez utiliser un appareil compatible (empreinte digitale, Face ID…).'
                );
            } else {
                setError(error.response?.data?.error || 'Email ou mot de passe incorrect.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ── Vérification code TOTP ──────────────────────────────────────────────
    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await verifyMfa(mfaToken, mfaCode);
            window.umami?.track('login-success', { method: 'password+mfa' });
            navigate('/admin');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            window.umami?.track('login-failure', { method: 'mfa' });
            setError(error.response?.data?.error || 'Code invalide. Réessayez.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">

                {/* Header */}
                <div className="text-center flex flex-col items-center">
                    <Logo className="h-20 w-auto" />
                    <p className="mt-4 text-muted-foreground">
                        Plateforme de gestion des menus
                    </p>
                </div>

                <div className="bg-card border border-border shadow-lg rounded-lg p-8">

                    {/* ── Mode passkey-first ─────────────────────────────── */}
                    {mode === 'passkey-first' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Fingerprint className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-lg font-semibold text-foreground">Bienvenue</h2>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Utilisez votre empreinte digitale, Face ID ou Windows Hello
                                    pour accéder à votre compte.
                                </p>
                            </div>

                            {error && (
                                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="button"
                                className="w-full"
                                onClick={handlePasskeyLogin}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    'Vérification en cours…'
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <Fingerprint className="w-4 h-4" />
                                        Se connecter avec cet appareil
                                    </span>
                                )}
                            </Button>

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => { setError(''); setMode('password'); }}
                                    className="text-sm text-muted-foreground hover:text-foreground"
                                >
                                    Se connecter avec mon mot de passe →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Mode password ──────────────────────────────────── */}
                    {mode === 'password' && (
                        <form onSubmit={handlePasswordSubmit} className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground mb-4">Connexion</h2>
                            </div>

                            <div>
                                <Label htmlFor="email">Adresse email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="votre@email.fr"
                                    required
                                    className="mt-1"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <Label htmlFor="password">Mot de passe</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="mt-1"
                                />
                            </div>

                            {error && (
                                <div className="text-destructive text-sm bg-destructive/10 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading ? 'Connexion…' : 'Se connecter'}
                            </Button>

                            {passkeySupported && (
                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={() => { setError(''); setMode('passkey-first'); }}
                                        className="text-sm text-muted-foreground hover:text-foreground"
                                    >
                                        ← Retour
                                    </button>
                                </div>
                            )}
                        </form>
                    )}

                    {/* ── Mode MFA (TOTP) ────────────────────────────────── */}
                    {mode === 'mfa' && (
                        <div className="space-y-6">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ShieldCheck className="w-8 h-8 text-primary" />
                                </div>
                                <h2 className="text-lg font-semibold text-foreground">Code de sécurité</h2>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Entrez le code à 6 chiffres affiché dans votre application
                                    d'authentification.
                                </p>
                            </div>

                            <form onSubmit={handleMfaSubmit} className="space-y-4">
                                <div>
                                    <Label htmlFor="mfaCode">Code à 6 chiffres</Label>
                                    <Input
                                        id="mfaCode"
                                        type="text"
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        required
                                        className="mt-1 text-center text-2xl tracking-widest"
                                        maxLength={6}
                                        autoFocus
                                        inputMode="numeric"
                                    />
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
                                    {isLoading ? 'Vérification…' : 'Vérifier'}
                                </Button>
                            </form>

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('password');
                                        setMfaCode('');
                                        setError('');
                                    }}
                                    className="text-sm text-muted-foreground hover:text-foreground"
                                >
                                    ← Retour
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Lien vers menu public */}
                <div className="text-center">
                    <Link
                        to="/menu"
                        className="text-sm text-muted-foreground hover:text-primary"
                    >
                        Consulter le menu du jour →
                    </Link>
                </div>
            </div>
        </div>
    );
}
