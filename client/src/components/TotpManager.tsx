/**
 * MARIAM - Gestionnaire TOTP
 *
 * Permet d'ajouter ou de supprimer l'authentification par code (TOTP)
 * depuis les paramètres du compte.
 *
 * Contrainte : impossible de désactiver si aucune passkey n'est enregistrée
 * (l'utilisateur doit toujours avoir au moins une méthode 2FA active).
 */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStepUp } from '@/hooks/useStepUp';
import { authApi } from '@/lib/api/auth';
import { getApiErrorMessage } from '@/lib/api/errors';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShieldCheck, ShieldOff, AlertCircle, Check, Smartphone } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function TotpManager() {
  const { user, refreshUser } = useAuth();
  const confirmIdentity = useStepUp();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [enrolmentToken, setEnrolmentToken] = useState('');
  const [setupStep, setSetupStep] = useState<'qr' | 'verify'>('qr');
  const [code, setCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const mfaEnabled = user?.mfa_enabled ?? false;
  const passkeysCount = user?.passkeys_count ?? 0;
  const canDisable = passkeysCount > 0;

  const confirmEnrolment = () =>
    confirmIdentity({
      description: mfaEnabled
        ? "Avant de changer l'appareil qui génère vos codes."
        : "Avant d'ajouter une méthode de connexion.",
    });

  const openSetup = async () => {
    if (!(await confirmEnrolment())) return;

    setMessage(null);
    setCode('');
    setSetupStep('qr');
    setIsReplacing(mfaEnabled);
    setIsLoading(true);
    setDialogOpen(true);

    try {
      const data = await authApi.mfaSetupBegin();
      setQrCode(data.qr_code);
      setSecret(data.secret);
      setEnrolmentToken(data.enrolment_token);
    } catch {
      setMessage({ type: 'error', text: 'Impossible de générer le QR code. Réessayez.' });
    } finally {
      setIsLoading(false);
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setMessage(null);
    setCode('');
    setQrCode('');
    setSecret('');
    setEnrolmentToken('');
    setSetupStep('qr');
  };

  const handleSetupConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!(await confirmEnrolment())) return;
    setIsLoading(true);

    try {
      await authApi.mfaSetupConfirm(enrolmentToken, code);
      await refreshUser();
      setMessage({
        type: 'success',
        text: isReplacing
          ? "Nouvel appareil activé. L'ancien ne fonctionne plus."
          : 'Authentification par code activée !',
      });
      setTimeout(closeDialog, 1500);
    } catch (err: unknown) {
      setMessage({ type: 'error', text: getApiErrorMessage(err, 'Code invalide. Réessayez.') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    const confirmed = await confirmIdentity({
      title: "Désactiver l'authentification par code",
      description:
        'Vous ne saisirez plus de code à la connexion par mot de passe. Votre passkey reste active.',
      confirmLabel: 'Désactiver',
      tone: 'destructive',
    });
    if (!confirmed) return;

    try {
      await authApi.disableMfa();
      await refreshUser();
      notify.success('Authentification par code désactivée');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'La désactivation a échoué'));
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">Application d'authentification</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Codes à 6 chiffres via Google Authenticator, Microsoft Authenticator, etc.
            </p>
            <span
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                mfaEnabled
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {mfaEnabled ? (
                <>
                  <ShieldCheck className="h-3 w-3" /> Actif
                </>
              ) : (
                <>
                  <ShieldOff className="h-3 w-3" /> Inactif
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
          {mfaEnabled ? (
            <>
              <Button variant="outline" size="sm" onClick={openSetup}>
                Changer d'appareil
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={!canDisable ? 0 : undefined} className="inline-flex">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={canDisable ? handleDisable : undefined}
                        disabled={!canDisable}
                        className={!canDisable ? 'pointer-events-none w-full opacity-50' : 'w-full'}
                      >
                        Désactiver
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canDisable && (
                    <TooltipContent side="left">
                      <p className="flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Enregistrez d'abord une passkey pour désactiver.
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={openSetup}>
              Configurer
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isReplacing
                ? 'Configurer le nouvel appareil'
                : "Configurer l'application d'authentification"}
            </DialogTitle>
            <DialogDescription>
              {isReplacing
                ? "Scannez ce QR code avec l'application du nouvel appareil, puis saisissez le code qu'elle affiche. L'ancien appareil cessera de fonctionner."
                : 'Scannez le QR code avec votre application, puis entrez le code affiché pour confirmer.'}
            </DialogDescription>
          </DialogHeader>

          {message && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                message.type === 'success'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.type === 'success' ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {message.text}
            </div>
          )}

          {isLoading && !qrCode ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : (
            <>
              {setupStep === 'qr' && qrCode && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <img
                      src={qrCode}
                      alt="QR Code TOTP"
                      className="h-44 w-44 rounded border border-border"
                    />
                  </div>
                  <div className="text-center">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Ou entrez cette clé manuellement :
                    </p>
                    <code className="break-all rounded bg-muted px-3 py-1 font-mono text-sm text-foreground">
                      {secret}
                    </code>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={closeDialog}>
                      Annuler
                    </Button>
                    <Button onClick={() => setSetupStep('verify')}>J'ai scanné le code →</Button>
                  </div>
                </div>
              )}

              {setupStep === 'verify' && (
                <form onSubmit={handleSetupConfirm} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="totpCode">Code de vérification</Label>
                    <Input
                      id="totpCode"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoFocus
                      className="text-center font-mono text-lg tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground">
                      Entrez le code affiché dans votre application.
                    </p>
                  </div>
                  <div className="flex justify-between gap-2 pt-1">
                    <Button type="button" variant="ghost" onClick={() => setSetupStep('qr')}>
                      ← Retour
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" type="button" onClick={closeDialog}>
                        Annuler
                      </Button>
                      <Button type="submit" disabled={isLoading || code.length !== 6}>
                        {isLoading ? 'Vérification…' : 'Activer'}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
