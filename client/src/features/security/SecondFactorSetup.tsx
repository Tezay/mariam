/**
 * Second-factor enrolment: choosing a method, then setting it up.
 *
 * Shared by account activation and by the enrolment page an account without any
 * second factor is sent to. Only the calls differ between the two — activation
 * has no session yet — so they are injected; every screen and message lives here.
 */
import { useEffect, useRef, useState } from 'react';
import { Fingerprint, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiErrorMessage } from '@/lib/api';

export interface SecondFactorEnrolment {
  /** Registers the passkey and updates the session. */
  registerPasskey: () => Promise<void>;
  beginTotp: () => Promise<{ qrCode: string; secret: string }>;
  /** Verifies the code and updates the session. */
  confirmTotp: (code: string) => Promise<void>;
}

type Step = 'choose' | 'passkey' | 'totp';

const passkeySupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

export function SecondFactorSetup({ enrolment }: { enrolment: SecondFactorEnrolment }) {
  const [step, setStep] = useState<Step>(passkeySupported ? 'choose' : 'totp');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');

  const enrolmentRef = useRef(enrolment);
  useEffect(() => {
    enrolmentRef.current = enrolment;
  });

  // Requested once and never again: a second call issues a new secret, which
  // would void the code the user is reading off their application.
  const totpRequested = useRef(false);
  useEffect(() => {
    if (step !== 'totp' || totpRequested.current) return;
    totpRequested.current = true;
    let active = true;
    setIsLoading(true);
    enrolmentRef.current
      .beginTotp()
      .then(({ qrCode: qr, secret: key }) => {
        if (!active) return;
        setQrCode(qr);
        setSecret(key);
      })
      .catch((err) => {
        if (active) setError(getApiErrorMessage(err, 'Impossible de générer le QR code.'));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [step]);

  const goTo = (next: Step) => {
    setError('');
    setCode('');
    setStep(next);
  };

  const handlePasskey = async () => {
    setError('');
    setIsLoading(true);
    try {
      await enrolment.registerPasskey();
    } catch (err) {
      const cancelled = (err as { name?: string }).name === 'NotAllowedError';
      setError(
        cancelled
          ? 'Enregistrement annulé. Réessayez ou choisissez une autre méthode.'
          : getApiErrorMessage(err, "Échec de l'enregistrement. Réessayez.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await enrolment.confirmTotp(code);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Code invalide'));
    } finally {
      setIsLoading(false);
    }
  };

  const errorBox = error && (
    <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
  );

  if (step === 'choose') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Sécurisez votre compte</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez comment vous souhaitez vous connecter à l'avenir.
          </p>
        </div>

        <button
          type="button"
          onClick={() => goTo('passkey')}
          className="group w-full rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Fingerprint className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                Empreinte digitale, Face ID ou Windows Hello
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Connectez-vous en un instant avec votre biométrie. Simple, rapide et très sécurisé.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => goTo('totp')}
          className="group w-full rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
              <Smartphone className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Application d'authentification</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Utilisez Google Authenticator, Microsoft Authenticator ou toute application
                compatible.
              </p>
            </div>
          </div>
        </button>
      </div>
    );
  }

  if (step === 'passkey') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Enregistrer votre appareil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Votre appareil va vous demander de confirmer votre identité (empreinte digitale, Face
            ID, Windows Hello…). Suivez les instructions à l'écran.
          </p>
        </div>

        {errorBox}

        <Button type="button" className="w-full" onClick={handlePasskey} disabled={isLoading}>
          {isLoading ? 'Activation en cours…' : 'Activer avec cet appareil'}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => goTo('choose')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Choisir une autre méthode
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleTotp} className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          Configuration de l'application
        </h2>
        <p className="text-sm text-muted-foreground">
          Scannez ce QR code avec votre application d'authentification (Google Authenticator,
          Microsoft Authenticator, etc.)
        </p>
      </div>

      <div className="flex justify-center">
        {qrCode ? (
          <img src={qrCode} alt="QR Code MFA" className="h-48 w-48 rounded border border-border" />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded border border-border">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        )}
      </div>

      {secret && (
        <div className="text-center">
          <p className="mb-1 text-xs text-muted-foreground">Ou entrez cette clé manuellement :</p>
          <code className="break-all rounded bg-muted px-3 py-1 font-mono text-sm text-foreground">
            {secret}
          </code>
        </div>
      )}

      <div>
        <Label htmlFor="mfaCode">Code de vérification</Label>
        <Input
          id="mfaCode"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          required
          className="mt-1 text-center text-2xl tracking-widest"
          maxLength={6}
          inputMode="numeric"
          autoFocus
        />
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Entrez le code à 6 chiffres affiché dans votre application
        </p>
      </div>

      {errorBox}

      <Button type="submit" className="w-full" disabled={isLoading || code.length !== 6}>
        {isLoading ? 'Vérification…' : 'Activer'}
      </Button>

      {passkeySupported && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => goTo('choose')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Choisir une autre méthode
          </button>
        </div>
      )}
    </form>
  );
}
