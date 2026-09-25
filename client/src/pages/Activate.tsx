/**
 * MARIAM - Account activation
 *
 * Steps:
 * 1. Password      — set the account password
 * 2. Second factor — passkey or authenticator application, on the screens the
 *    dashboard enrolment page also uses, then straight into the session
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';
import { X } from 'lucide-react';
import {
  SecondFactorSetup,
  type SecondFactorEnrolment,
} from '@/features/security/SecondFactorSetup';
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';

type Step = 'loading' | 'invalid' | 'password' | 'second-factor';

export function Activate() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { activateComplete } = useAuth();

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

  // MFA / passkey setup
  const [qrCode, setQrCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [userId, setUserId] = useState<number>(0);
  const [setupToken, setSetupToken] = useState('');

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
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'`~]/.test(pwd)) errors.push('Un caractère spécial');
    return errors;
  };

  const passwordErrors = validatePassword(password);
  const passwordsMatch = password === confirmPassword;

  // Soumission du mot de passe → affiche le choix 2FA
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
        setSetupToken(result.mfa_setup.setup_token);
        setStep('second-factor');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Erreur lors de l'activation"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // The activation endpoints carry their own setup token: there is no session
  // to authenticate with until one of these two calls succeeds.
  const enrolment: SecondFactorEnrolment = {
    registerPasskey: async () => {
      const { options, challenge_token } = await authApi.passkeySetupBegin(userId, setupToken);
      const credential = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      const user = await authApi.passkeySetupComplete(userId, challenge_token, credential);
      activateComplete(user);
      navigate('/admin');
    },
    beginTotp: async () => ({ qrCode, secret: mfaSecret }),
    confirmTotp: async (code) => {
      const user = await authApi.verifyMfaSetup(userId, code, setupToken);
      activateComplete(user);
      navigate('/admin');
    },
  };

  // ── Loading / invalid steps ─────────────────────────────────────────────

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
              <X className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Lien invalide</h2>
            <p className="text-muted-foreground">Ce lien d'activation est invalide ou a expiré.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <Logo className="h-20 w-auto" />
          <p className="mt-4 text-muted-foreground">
            {linkInfo?.link_type === 'first_admin'
              ? 'Configuration du premier administrateur'
              : 'Activation de votre compte'}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-lg">
          {/* ── Step 1: password ────────────────────────────── */}
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
                <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || passwordErrors.length > 0 || !passwordsMatch}
              >
                {isLoading ? 'Création…' : 'Créer mon compte'}
              </Button>
            </form>
          )}

          {/* ── Step 2: second factor ───────────────────────── */}
          {step === 'second-factor' && <SecondFactorSetup enrolment={enrolment} />}
        </div>
      </div>
    </div>
  );
}
