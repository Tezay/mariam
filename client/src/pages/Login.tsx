/**
 * MARIAM - Page de connexion
 * 
 * Connexion en 2 étapes :
 * 1. Email + Mot de passe
 * 2. Code MFA (si activé)
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Login() {
    const navigate = useNavigate();
    const { login, verifyMfa } = useAuth();

    // État du formulaire
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');

    // État MFA
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaToken, setMfaToken] = useState('');

    // UI
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const result = await login(email, password);

            if (result.mfaRequired && result.mfaToken) {
                setMfaRequired(true);
                setMfaToken(result.mfaToken);
            } else {
                navigate('/admin');
            }
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setError(error.response?.data?.error || 'Erreur de connexion');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMfaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await verifyMfa(mfaToken, mfaCode);
            navigate('/admin');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            setError(error.response?.data?.error || 'Code MFA invalide');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-mariam-blue tracking-tight">
                        MARIAM
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Plateforme de gestion des menus
                    </p>
                </div>

                {/* Formulaire */}
                <div className="bg-white shadow-lg rounded-lg p-8">
                    {!mfaRequired ? (
                        // Étape 1 : Email + Mot de passe
                        <form onSubmit={handleLoginSubmit} className="space-y-6">
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
                                <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Connexion...' : 'Se connecter'}
                            </Button>
                        </form>
                    ) : (
                        // Étape 2 : Code MFA
                        <form onSubmit={handleMfaSubmit} className="space-y-6">
                            <div className="text-center mb-4">
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <h2 className="text-lg font-semibold">Vérification en deux étapes</h2>
                                <p className="text-gray-600 text-sm mt-1">
                                    Entrez le code de votre application d'authentification
                                </p>
                            </div>

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
                                />
                            </div>

                            {error && (
                                <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                                    {error}
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading || mfaCode.length !== 6}
                            >
                                {isLoading ? 'Vérification...' : 'Vérifier'}
                            </Button>

                            <button
                                type="button"
                                onClick={() => {
                                    setMfaRequired(false);
                                    setMfaCode('');
                                    setError('');
                                }}
                                className="w-full text-sm text-gray-500 hover:text-gray-700"
                            >
                                ← Retour
                            </button>
                        </form>
                    )}
                </div>

                {/* Lien vers menu public */}
                <div className="text-center">
                    <Link
                        to="/menu"
                        className="text-sm text-gray-500 hover:text-mariam-blue"
                    >
                        Consulter le menu du jour →
                    </Link>
                </div>
            </div>
        </div>
    );
}
