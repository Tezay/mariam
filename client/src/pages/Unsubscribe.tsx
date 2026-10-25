import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { isAxiosError } from 'axios';
import { CheckCircle2, Link2Off, MailX } from 'lucide-react';
import { weeklyEmailsApi } from '@/lib/api/weekly-emails';
import { getApiErrorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/ui/spinner';

type Step = 'ready' | 'sending' | 'done' | 'invalid';

/** Asks for a click: a mail scanner that opens the link must not unsubscribe anyone. */
export function Unsubscribe() {
  const { token = '' } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('ready');
  const [error, setError] = useState('');

  const unsubscribe = async () => {
    setStep('sending');
    setError('');
    try {
      await weeklyEmailsApi.unsubscribe(token);
      setStep('done');
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        setStep('invalid');
        return;
      }
      setError(getApiErrorMessage(err, 'Le désabonnement a échoué. Réessayez dans un instant.'));
      setStep('ready');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <Logo className="mx-auto mb-6 h-8 w-auto" />

        {step === 'done' ? (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-green-600 dark:text-green-400" />
            <h1 className="mb-2 text-xl font-semibold text-foreground">Vous êtes désabonné</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Vous ne recevrez plus l'e-mail de la semaine. Pour le recevoir de nouveau, activez-le
              dans « Mon compte », rubrique Notifications.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Aller à Mariam</Link>
            </Button>
          </>
        ) : step === 'invalid' ? (
          <>
            <Link2Off className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h1 className="mb-2 text-xl font-semibold text-foreground">Lien non valable</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Ce lien ne correspond à aucun compte. Vous pouvez choisir les e-mails que vous recevez
              dans « Mon compte », rubrique Notifications, une fois connecté.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Se connecter</Link>
            </Button>
          </>
        ) : (
          <>
            <MailX className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <h1 className="mb-2 text-xl font-semibold text-foreground">
              Se désabonner de l'e-mail de la semaine
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Vous ne recevrez plus le résumé hebdomadaire, ni l'avis de réouverture qui le remplace
              pendant une fermeture. Les e-mails liés à la sécurité de votre compte continueront de
              vous parvenir.
            </p>
            {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
            <Button onClick={unsubscribe} disabled={step === 'sending'} className="w-full gap-2">
              {step === 'sending' && <Spinner className="size-4" />}
              Me désabonner
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
