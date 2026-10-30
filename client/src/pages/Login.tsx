import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { PasskeyOffer } from '@/features/security/PasskeyOffer';
import { usePasskeyAutofill } from '@/hooks/usePasskeyAutofill';
import { needsSecuritySetup } from '@/hooks/useSecurityOnboarding';
import { detectPlatform } from '@/lib/app-install';
import { dashboardPathForRole } from '@/lib/dashboard-routes';
import { authApi } from '@/lib/api/auth';
import { getApiErrorMessage, getProblemCode } from '@/lib/api/errors';
import type { Account } from '@/lib/api/user';
import { readOfferAnswer, shouldOfferPasskey } from '@/lib/passkey-offer';
import { signalUnknownPasskey } from '@/lib/passkey-signals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { PasswordInput } from '@/components/PasswordInput';
import { ChevronDown, Fingerprint, ShieldCheck } from 'lucide-react';
import {
  platformAuthenticatorIsAvailable,
  startAuthentication,
  type AuthenticationResponseJSON,
  type AuthenticatorAttachment,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

type Step = 'identify' | 'password' | 'mfa' | 'offer';

function passkeySignInError(err: unknown): string {
  if ((err as { name?: string }).name === 'NotAllowedError') {
    return 'Authentification annulée ou expirée. Réessayez.';
  }
  if (getProblemCode(err) === 'passkey_unknown') {
    return 'Cette passkey ne correspond à aucun compte. Connectez-vous avec votre mot de passe.';
  }
  return getApiErrorMessage(err, "Échec de l'authentification.");
}

export function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  const [step, setStep] = useState<Step>('identify');
  const [email, setEmail] = useState('');
  const [addressFocused, setAddressFocused] = useState(false);
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [signedIn, setSignedIn] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [passkeyOnly, setPasskeyOnly] = useState(false);

  const goTo = (next: Step) => {
    setError('');
    setPasskeyOnly(false);
    setStep(next);
  };

  // Told only now: the route sends a signed-in account to its dashboard at once,
  // which would leave no time for the offer.
  const enter = (account: Account) => {
    signIn(account);
    navigate(dashboardPathForRole(account.role));
  };

  const finishSignIn = async (
    account: Account,
    method: 'passkey' | 'password',
    attachment?: AuthenticatorAttachment
  ) => {
    const now = Date.now();
    const offer = shouldOfferPasskey({
      method,
      attachment,
      platformAvailable: await platformAuthenticatorIsAvailable(),
      answer: readOfferAnswer(now),
      hasSecondFactor: !needsSecuritySetup(account),
      now,
    });
    if (!offer) {
      enter(account);
      return;
    }
    setSignedIn(account);
    setStep('offer');
  };

  const completePasskeySignIn = async (
    challengeToken: string,
    credential: AuthenticationResponseJSON,
    rpId?: string
  ) => {
    let account: Account;
    try {
      account = await authApi.passkeyLoginComplete(challengeToken, credential);
    } catch (err: unknown) {
      if (rpId && getProblemCode(err) === 'passkey_unknown') {
        void signalUnknownPasskey(rpId, credential.id);
      }
      throw err;
    }
    window.umami?.track('login-success', { method: 'passkey' });
    await finishSignIn(account, 'passkey', credential.authenticatorAttachment);
  };

  const signInWith = async (attempt: () => Promise<void>) => {
    setError('');
    setIsLoading(true);
    try {
      await attempt();
    } catch (err: unknown) {
      window.umami?.track('login-failure', { method: 'passkey' });
      setError(passkeySignInError(err));
    } finally {
      setIsLoading(false);
    }
  };

  usePasskeyAutofill(step === 'identify' && !isLoading, (challengeToken, credential, rpId) =>
    signInWith(() => completePasskeySignIn(challengeToken, credential, rpId))
  );

  const handlePasskeyButton = () =>
    signInWith(async () => {
      const { options, challenge_token } = await authApi.passkeyLoginBegin();
      const optionsJSON = options as unknown as PublicKeyCredentialRequestOptionsJSON;
      const credential = await startAuthentication({ optionsJSON });
      await completePasskeySignIn(challenge_token, credential, optionsJSON.rpId);
    });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goTo('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await authApi.login(email, password);

      if ('mfaToken' in result) {
        setMfaToken(result.mfaToken);
        setStep('mfa');
      } else {
        window.umami?.track('login-success', { method: 'password' });
        await finishSignIn(result.user, 'password');
      }
    } catch (err: unknown) {
      window.umami?.track('login-failure', { method: 'password' });
      if (getProblemCode(err) === 'passkey_only') {
        setPasskeyOnly(true);
        setError('Ce compte se connecte avec une passkey, pas avec un mot de passe.');
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
      const account = await authApi.verifyMfa(mfaToken, mfaCode);
      window.umami?.track('login-success', { method: 'password+mfa' });
      await finishSignIn(account, 'password');
    } catch (err: unknown) {
      window.umami?.track('login-failure', { method: 'mfa' });
      setError(getApiErrorMessage(err, 'Code invalide. Réessayez.'));
    } finally {
      setIsLoading(false);
    }
  };

  const errorBox = error && (
    <div role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">
      {error}
    </div>
  );

  const addressFirst = !passkeySupported || addressFocused || email !== '';

  const passkeyButton = (
    <Button
      type="button"
      variant={step === 'identify' && addressFirst ? 'outline' : 'default'}
      size="lg"
      className="w-full px-4"
      onClick={handlePasskeyButton}
      disabled={isLoading}
    >
      <Fingerprint />
      {isLoading ? 'Vérification…' : 'Se connecter avec cet appareil'}
    </Button>
  );

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-4 sm:py-6">
      <div className="w-full max-w-md space-y-4 sm:space-y-6">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-12 w-auto sm:h-16" />
          <p className="mt-2 text-sm text-muted-foreground">Plateforme de gestion des menus</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-lg sm:p-6">
          {(step === 'identify' || step === 'password') && (
            <form
              method="post"
              onSubmit={step === 'identify' ? handleEmailSubmit : handlePasswordSubmit}
              className="space-y-4"
            >
              {step === 'identify' ? (
                <>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold text-foreground">Bienvenue</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {passkeySupported
                        ? "Utilisez l'empreinte, le visage ou le code de cet appareil."
                        : 'Connectez-vous avec votre adresse e-mail.'}
                    </p>
                  </div>

                  {errorBox}

                  {passkeySupported && (
                    <>
                      {passkeyButton}

                      {detectPlatform() === 'desktop' && (
                        <details className="group text-center text-sm">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            Votre passkey est sur votre téléphone ?
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                          </summary>
                          <p className="mt-2 text-muted-foreground">
                            Cliquez sur « Se connecter avec cet appareil », choisissez l'option du
                            téléphone dans la fenêtre qui s'ouvre, puis scannez le code avec lui. Le
                            Bluetooth doit être activé sur les deux appareils.
                          </p>
                        </details>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        ou
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center">
                  <h2 className="text-lg font-semibold text-foreground">Bienvenue</h2>
                  <p className="mt-1 flex items-center justify-center gap-2 text-sm">
                    <span className="truncate text-muted-foreground">{email}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword('');
                        goTo('identify');
                      }}
                      className="shrink-0 font-medium text-primary hover:underline"
                    >
                      Modifier
                    </button>
                  </p>
                </div>
              )}

              {/* Stays in the form once hidden, so a password manager saves it with the password. */}
              <div hidden={step !== 'identify'}>
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete={step === 'identify' ? 'username webauthn' : 'username'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setAddressFocused(true)}
                  onBlur={() => setAddressFocused(false)}
                  required
                  className="mt-1"
                />
              </div>

              {step === 'identify' ? (
                <Button
                  type="submit"
                  variant={addressFirst ? 'default' : 'outline'}
                  className="w-full"
                  disabled={isLoading}
                >
                  Continuer
                </Button>
              ) : (
                <>
                  <div>
                    <Label htmlFor="password">Mot de passe</Label>
                    <PasswordInput
                      id="password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      className="mt-1"
                    />
                  </div>

                  {errorBox}

                  {passkeyOnly ? (
                    passkeySupported && passkeyButton
                  ) : (
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Connexion…' : 'Se connecter'}
                    </Button>
                  )}

                  <p className="text-center text-sm text-muted-foreground">
                    Mot de passe oublié ? Contactez l'administrateur de votre établissement, ou
                    écrivez à{' '}
                    <a className="text-primary underline" href="mailto:contact@mariam.app">
                      contact@mariam.app
                    </a>
                    .
                  </p>
                </>
              )}
            </form>
          )}

          {step === 'offer' && signedIn && (
            <PasskeyOffer account={signedIn} onDone={() => enter(signedIn)} />
          )}

          {step === 'mfa' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <ShieldCheck className="h-6 w-6 text-primary" />
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
                    autoComplete="one-time-code"
                  />
                </div>

                {errorBox}

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
                    setMfaCode('');
                    goTo('password');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Retour
                </button>
              </div>
            </div>
          )}
        </div>

        {step === 'identify' && (
          <div className="text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
              Consulter le menu du jour →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
