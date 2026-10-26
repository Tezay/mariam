import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardPathForRole } from '@/lib/dashboard-routes';
import { authApi } from '@/lib/api/auth';
import { getApiErrorMessage, getProblemCode } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

type LoginMode = 'passkey-first' | 'password' | 'mfa';

export function Login() {
  const navigate = useNavigate();
  const { login, verifyMfa, loginWithPasskey } = useAuth();

  const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;
  const [mode, setMode] = useState<LoginMode>(passkeySupported ? 'passkey-first' : 'password');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePasskeyLogin = async () => {
    setError('');
    setIsLoading(true);

    try {
      const { options, challenge_token } = await authApi.passkeyLoginBegin();
      const credential = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      const loggedUser = await loginWithPasskey(challenge_token, credential);
      window.umami?.track('login-success', { method: 'passkey' });
      navigate(dashboardPathForRole(loggedUser?.role));
    } catch (err: unknown) {
      window.umami?.track('login-failure', { method: 'passkey' });
      if ((err as { name?: string }).name === 'NotAllowedError') {
        setError('Authentification annulée ou expirée. Réessayez.');
      } else if (getProblemCode(err) === 'passkey_unknown') {
        setError('Aucune passkey trouvée. Connectez-vous avec votre mot de passe.');
      } else {
        setError(getApiErrorMessage(err, "Échec de l'authentification."));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if ('mfaToken' in result) {
        setMfaToken(result.mfaToken);
        setMode('mfa');
      } else {
        window.umami?.track('login-success', { method: 'password' });
        navigate(dashboardPathForRole(result.user.role));
      }
    } catch (err: unknown) {
      window.umami?.track('login-failure', { method: 'password' });
      if (getProblemCode(err) === 'passkey_only') {
        setError(
          'Ce compte utilise la connexion par passkey. ' +
            'Veuillez utiliser un appareil compatible (empreinte digitale, Face ID…).'
        );
      } else {
        setError(getApiErrorMessage(err, 'Email ou mot de passe incorrect.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const loggedUser = await verifyMfa(mfaToken, mfaCode);
      window.umami?.track('login-success', { method: 'password+mfa' });
      navigate(dashboardPathForRole(loggedUser?.role));
    } catch (err: unknown) {
      window.umami?.track('login-failure', { method: 'mfa' });
      setError(getApiErrorMessage(err, 'Code invalide. Réessayez.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-20 w-auto" />
          <p className="mt-4 text-muted-foreground">Plateforme de gestion des menus</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-lg">
          {mode === 'passkey-first' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Fingerprint className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Bienvenue</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Utilisez votre empreinte digitale, Face ID ou Windows Hello pour accéder à votre
                  compte.
                </p>
              </div>

              {error && (
                <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
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
                    <Fingerprint className="h-4 w-4" />
                    Se connecter avec cet appareil
                  </span>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('password');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Se connecter avec mon mot de passe →
                </button>
              </div>
            </div>
          )}

          {mode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div>
                <h2 className="mb-4 text-lg font-semibold text-foreground">Connexion</h2>
              </div>

              <div>
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  required
                  className="mt-1"
                />
              </div>

              {error && (
                <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Connexion…' : 'Se connecter'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Mot de passe oublié ? Contactez l'administrateur de votre établissement, ou écrivez
                à{' '}
                <a className="text-primary underline" href="mailto:contact@mariam.app">
                  contact@mariam.app
                </a>
                .
              </p>

              {passkeySupported && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('passkey-first');
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ← Retour
                  </button>
                </div>
              )}
            </form>
          )}

          {mode === 'mfa' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Code de sécurité</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Entrez le code à 6 chiffres affiché dans votre application d'authentification.
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
                  <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
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

        <div className="text-center">
          <Link to="/menu" className="text-sm text-muted-foreground hover:text-primary">
            Consulter le menu du jour →
          </Link>
        </div>
      </div>
    </div>
  );
}
