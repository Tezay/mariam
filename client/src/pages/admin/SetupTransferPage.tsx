/**
 * MARIAM — Réception du transfert de session (onboarding PWA cross-device)
 *
 * Ouvert sur le téléphone après scan du QR code. Valide le jeton de transfert,
 * crée une session complète, puis redirige vers la page compte pour enregistrer
 * une passkey sur ce nouvel appareil.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle } from 'lucide-react';

type State = 'validating' | 'success' | 'error';

export function SetupTransferPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { refreshUser } = useAuth();
    const [state, setState] = useState<State>('validating');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const token = searchParams.get('transfer_token');
        if (!token) {
            setErrorMsg('Lien invalide ou incomplet.');
            setState('error');
            return;
        }

        authApi.validateSessionTransfer(token)
            .then(async () => {
                await refreshUser();
                setState('success');
            })
            .catch((err) => {
                const msg = err?.response?.data?.error ?? 'Le lien a expiré ou est invalide.';
                setErrorMsg(msg);
                setState('error');
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleContinue = () => {
        navigate('/admin/account', { replace: true, state: { promptPasskey: true } });
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 gap-8">
            <Logo className="h-8" />

            {state === 'validating' && (
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                    <p className="text-muted-foreground">Connexion en cours…</p>
                </div>
            )}

            {state === 'success' && (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
                    <CheckCircle className="w-14 h-14 text-green-500" />
                    <div>
                        <h1 className="text-2xl font-bold mb-2">Connecté !</h1>
                        <p className="text-muted-foreground text-sm">
                            Pour vous connecter facilement depuis cet appareil à l'avenir,
                            enregistrez une passkey (Face ID / empreinte digitale).
                        </p>
                    </div>
                    <Button className="w-full" onClick={handleContinue}>
                        Enregistrer une passkey sur cet appareil
                    </Button>
                    <button
                        onClick={() => navigate('/admin/menus', { replace: true })}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                    >
                        Passer cette étape
                    </button>
                </div>
            )}

            {state === 'error' && (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm text-center">
                    <AlertCircle className="w-14 h-14 text-destructive" />
                    <div>
                        <h1 className="text-2xl font-bold mb-2">Lien expiré</h1>
                        <p className="text-muted-foreground text-sm">{errorMsg}</p>
                    </div>
                    <Button variant="outline" onClick={() => navigate('/login', { replace: true })}>
                        Se connecter manuellement
                    </Button>
                </div>
            )}
        </div>
    );
}
