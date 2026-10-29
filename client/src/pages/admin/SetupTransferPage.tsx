import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { authApi } from '@/lib/api/auth';
import { getApiErrorMessage, isConfirmationRequired } from '@/lib/api/errors';
import { userApi } from '@/lib/api/user';
import { passkeyRegistrationError } from '@/lib/passkey-errors';
import { useAuth } from '@/contexts/AuthContext';
import { installPathForRole } from '@/lib/dashboard-routes';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, Fingerprint } from 'lucide-react';
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { Spinner } from '@/components/ui/spinner';

type State = 'validating' | 'success' | 'passkey_pending' | 'passkey_done' | 'error';

export function SetupTransferPage() {
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<State>('validating');
  const [errorMsg, setErrorMsg] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const token = searchParams.get('transfer_token');
    if (!token) {
      setErrorMsg('Lien invalide ou incomplet.');
      setState('error');
      return;
    }

    authApi
      .validateSessionTransfer(token)
      .then(async () => {
        await refreshUser();
        setState('success');
      })
      .catch((err) => {
        setErrorMsg(getApiErrorMessage(err, 'Le lien a expiré ou est invalide.'));
        setState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegisterPasskey = async () => {
    setIsRegistering(true);
    setPasskeyError('');
    try {
      const { options, challenge_token } = await userApi.passkeyOptions();
      const credential = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      await userApi.createPasskey(challenge_token, credential);
      setState('passkey_done');
    } catch (err) {
      // This device has no second factor of its own to confirm with: only a new
      // QR code brings back a confirmed session.
      setPasskeyError(
        isConfirmationRequired(err)
          ? 'Le délai pour enregistrer une passkey est dépassé. Scannez de nouveau le QR code, ou ignorez cette étape.'
          : passkeyRegistrationError(err)
      );
    } finally {
      setIsRegistering(false);
    }
  };

  const handleContinue = () => {
    window.location.href = installPathForRole(user?.role);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <Logo className="h-8" />

      {state === 'validating' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner className="size-8 text-primary" />
          <p className="text-muted-foreground">Connexion en cours…</p>
        </div>
      )}

      {state === 'success' && (
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <CheckCircle className="h-14 w-14 text-green-500" />
          <div>
            <h1 className="mb-2 text-2xl font-bold">Connecté !</h1>
            <p className="text-sm text-muted-foreground">
              Pour vous connecter facilement depuis cet appareil à l'avenir, enregistrez une passkey
              (Face ID / empreinte digitale).
            </p>
          </div>

          {passkeyError && <p className="text-sm text-destructive">{passkeyError}</p>}

          <Button className="w-full gap-2" onClick={handleRegisterPasskey} disabled={isRegistering}>
            <Fingerprint className="h-4 w-4" />
            {isRegistering ? 'Enregistrement…' : 'Enregistrer une passkey sur cet appareil'}
          </Button>
          <button
            onClick={handleContinue}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Passer cette étape
          </button>
        </div>
      )}

      {state === 'passkey_done' && (
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <CheckCircle className="h-14 w-14 text-green-500" />
          <div>
            <h1 className="mb-2 text-2xl font-bold">Passkey enregistrée !</h1>
            <p className="text-sm text-muted-foreground">
              Vous pouvez maintenant vous connecter avec votre empreinte ou Face ID.
            </p>
          </div>
          <Button className="w-full" onClick={handleContinue}>
            Continuer
          </Button>
        </div>
      )}

      {state === 'error' && (
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <AlertCircle className="h-14 w-14 text-destructive" />
          <div>
            <h1 className="mb-2 text-2xl font-bold">Lien expiré</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = '/login';
            }}
          >
            Se connecter manuellement
          </Button>
        </div>
      )}
    </div>
  );
}
