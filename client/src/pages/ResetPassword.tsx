/**
 * MARIAM - Page de réinitialisation de mot de passe
 *
 * Permet à un utilisateur de définir un nouveau mot de passe via un lien à usage
 * unique (72h). La confirmation d'identité s'adapte au profil de sécurité :
 * - Passkey uniquement  → vérification biométrique
 * - TOTP uniquement     → code à 6 chiffres
 * - Les deux            → sélecteur, même UX que la page Mon Compte
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { Fingerprint } from 'lucide-react';
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

type Step = 'loading' | 'invalid' | 'form' | 'success';
type VerificationMethod = 'totp' | 'passkey';

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [email, setEmail] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('totp');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;
  const canUseBoth = mfaEnabled && hasPasskeys && passkeySupported;

  useEffect(() => {
    const checkLink = async () => {
      if (!token) {
        setStep('invalid');
        return;
      }
      try {
        const data = await authApi.checkResetLink(token);
        if (data.valid) {
          setEmail(data.email || '');
          setMfaEnabled(!!data.mfa_enabled);
          setHasPasskeys(!!data.has_passkeys);
          // Méthode par défaut selon ce qui est disponible
          const defaultMethod: VerificationMethod = data.mfa_enabled ? 'totp' : 'passkey';
          setVerificationMethod(defaultMethod);
          setStep('form');
        } else {
          setStep('invalid');
        }
      } catch {
        setStep('invalid');
      }
    };
    checkLink();
  }, [token]);

  const validatePassword = (pwd: string) => {
    const errors: string[] = [];
    if (pwd.length < 12) errors.push('Au moins 12 caractères');
    if (!/[A-Z]/.test(pwd)) errors.push('Une majuscule');
    if (!/[a-z]/.test(pwd)) errors.push('Une minuscule');
    if (!/\d/.test(pwd)) errors.push('Un chiffre');
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'`~]/.test(pwd)) errors.push('Un caractère spécial');
    return errors;
  };

  const passwordErrors = validatePassword(password);
  const passwordsMatch = password === confirmPassword;

  const handleSubmitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (passwordErrors.length > 0 || !passwordsMatch) {
      setError('Veuillez corriger les erreurs ci-dessus');
      return;
    }
    if (mfaCode.length !== 6) {
      setError('Le code MFA doit contenir 6 chiffres');
      return;
    }
    setIsLoading(true);
    try {
      await authApi.resetPassword(token!, password, mfaCode);
      setStep('success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        e.response?.data?.message || e.response?.data?.error || 'Erreur lors de la réinitialisation'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (passwordErrors.length > 0 || !passwordsMatch) {
      setError('Veuillez corriger les erreurs ci-dessus');
      return;
    }
    setIsLoading(true);
    try {
      const { options, challenge_token } = await authApi.passkeyResetPasswordBegin(token!);
      const credential = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      await authApi.passkeyResetPasswordComplete(password, challenge_token, credential, token!);
      setStep('success');
    } catch (err: unknown) {
      const e = err as {
        name?: string;
        response?: { data?: { error?: string; message?: string } };
      };
      if (e.name === 'NotAllowedError') {
        setError('Authentification annulée. Réessayez.');
      } else {
        setError(
          e.response?.data?.message ||
            e.response?.data?.error ||
            'Erreur lors de la réinitialisation'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
      </div>
    );
  }

  if (step === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="rounded-lg border border-border bg-card p-8 shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg
                className="h-8 w-8 text-destructive"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Lien invalide</h2>
            <p className="text-muted-foreground">
              Ce lien de réinitialisation est invalide ou a expiré.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <div className="rounded-lg border border-border bg-card p-8 shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg
                className="h-8 w-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              Mot de passe réinitialisé
            </h2>
            <p className="mb-6 text-muted-foreground">
              Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.
            </p>
            <Button onClick={() => navigate('/login')} className="w-full">
              Se connecter
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-20 w-auto" />
          <p className="mt-4 text-muted-foreground">Réinitialisation du mot de passe</p>
        </div>

        <div className="space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
          {/* Email (lecture seule) */}
          <div>
            <Label htmlFor="email">Adresse email</Label>
            <Input id="email" type="email" value={email} disabled className="mt-1 bg-muted" />
          </div>

          {/* Nouveau mot de passe */}
          <div>
            <Label htmlFor="password">Nouveau mot de passe</Label>
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
                <p className="mb-1 text-muted-foreground">Le mot de passe doit contenir :</p>
                <ul className="space-y-1">
                  {passwordErrors.map((err, i) => (
                    <li key={i} className="flex items-center gap-1 text-destructive">
                      <span>✗</span> {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confirmation */}
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

          {/* Sélecteur de méthode (si les deux sont disponibles) */}
          {canUseBoth && (
            <div className="flex overflow-hidden rounded-lg border border-border text-sm">
              <button
                type="button"
                onClick={() => setVerificationMethod('totp')}
                className={`flex-1 px-3 py-2 transition-colors ${
                  verificationMethod === 'totp'
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
                }`}
              >
                Code application
              </button>
              <button
                type="button"
                onClick={() => setVerificationMethod('passkey')}
                className={`flex-1 border-l border-border px-3 py-2 transition-colors ${
                  verificationMethod === 'passkey'
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-muted/30 text-muted-foreground hover:bg-muted/60'
                }`}
              >
                Cet appareil
              </button>
            </div>
          )}

          {/* Vérification TOTP */}
          {mfaEnabled && (!canUseBoth || verificationMethod === 'totp') && (
            <form onSubmit={handleSubmitTotp} className="space-y-4">
              <div>
                <Label htmlFor="mfaCode">Code d'authentification (A2F)</Label>
                <Input
                  id="mfaCode"
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  className="mt-1 text-center font-mono text-2xl tracking-widest"
                  maxLength={6}
                  inputMode="numeric"
                />
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  Entrez le code à 6 chiffres de votre application d'authentification
                </p>
              </div>

              {error && (
                <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={
                  isLoading || passwordErrors.length > 0 || !passwordsMatch || mfaCode.length !== 6
                }
              >
                {isLoading ? 'Réinitialisation...' : 'Réinitialiser mon mot de passe'}
              </Button>
            </form>
          )}

          {/* Vérification passkey */}
          {hasPasskeys && passkeySupported && (!mfaEnabled || verificationMethod === 'passkey') && (
            <form onSubmit={handleSubmitPasskey} className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
                Votre appareil vous demandera de confirmer votre identité.
              </p>

              {error && (
                <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={isLoading || passwordErrors.length > 0 || !passwordsMatch}
              >
                <Fingerprint className="h-4 w-4" />
                {isLoading ? 'Vérification...' : 'Confirmer avec cet appareil'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
