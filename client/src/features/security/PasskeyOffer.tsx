import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Account } from '@/lib/api/user';
import { passkeyRegistrationError } from '@/lib/passkey-errors';
import { saveOfferAnswer } from '@/lib/passkey-offer';
import { registerPasskey } from '@/lib/passkey-registration';

type Step = 'offer' | 'creating' | 'created' | 'present';

function Done({
  title,
  text,
  onContinue,
}: {
  title: string;
  text: string;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-5 text-center" role="status">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
        <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
      <Button type="button" className="w-full" onClick={onContinue} autoFocus>
        Continuer
      </Button>
    </div>
  );
}

export function PasskeyOffer({ account, onDone }: { account: Account; onDone: () => void }) {
  const [step, setStep] = useState<Step>('offer');
  const [error, setError] = useState('');

  const create = async () => {
    setError('');
    setStep('creating');
    try {
      await registerPasskey({ thisDevice: true });
      saveOfferAnswer({ created: true });
      setStep('created');
    } catch (err) {
      if ((err as { name?: string }).name === 'InvalidStateError') {
        saveOfferAnswer({ created: true });
        setStep('present');
      } else {
        setError(passkeyRegistrationError(err));
        setStep('offer');
      }
    }
  };

  const decline = () => {
    saveOfferAnswer({ declinedAt: Date.now() });
    onDone();
  };

  if (step === 'created') {
    return (
      <Done
        title="Passkey créée"
        text="Elle est enregistrée dans le gestionnaire de mots de passe de l'appareil : la prochaine fois, connectez-vous ici d'un geste."
        onContinue={onDone}
      />
    );
  }
  if (step === 'present') {
    return (
      <Done
        title="Passkey déjà présente"
        text="Cet appareil a déjà une passkey pour votre compte : la prochaine fois, connectez-vous ici d'un geste."
        onContinue={onDone}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3" role="status">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">Connexion réussie</h2>
          <p className="truncate text-sm text-muted-foreground">
            Bienvenue, {account.username || account.email}.
          </p>
        </div>
      </div>

      <section
        aria-labelledby="passkey-offer-title"
        className="space-y-3 border-t border-border pt-4"
      >
        <p className="text-xs font-medium text-muted-foreground">
          Pour la prochaine fois, si vous le souhaitez
        </p>
        <h3
          id="passkey-offer-title"
          className="flex items-center gap-2 font-semibold text-foreground"
        >
          <Fingerprint className="h-5 w-5 shrink-0 text-primary" />
          Connectez-vous d'un geste sur cet appareil
        </h3>
        <p className="text-sm text-muted-foreground">
          Une passkey vous connecte sans mot de passe, code ni téléphone : votre empreinte, votre
          visage ou le code de l'appareil suffit.
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          Sur un poste partagé, vos collègues pourraient se connecter à votre compte.
        </p>

        {error && (
          <div className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            className="flex-1 px-3"
            onClick={create}
            disabled={step === 'creating'}
          >
            {step === 'creating' ? 'Création…' : 'Créer une passkey'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 px-3"
            onClick={decline}
            disabled={step === 'creating'}
          >
            Pas maintenant
          </Button>
        </div>
      </section>
    </div>
  );
}
