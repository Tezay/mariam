/**
 * Re-authentication gate for an irreversible action.
 *
 * Offers whichever methods the account actually has (passkey, password, TOTP)
 * and hands back a single-use proof the caller attaches to its request.
 */
import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { AlertTriangle, Fingerprint, Loader2 } from 'lucide-react';
import { authApi, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Shown in a warning block above the form. */
  warning?: string;
  confirmLabel: string;
  onConfirmed: (stepUpToken: string) => Promise<void> | void;
}

export function StepUpDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmLabel,
  onConfirmed,
}: StepUpDialogProps) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  const hasPasskey = (user?.passkeys_count ?? 0) > 0;
  const needsTotp = Boolean(user?.mfa_enabled);

  const reset = () => {
    setPassword('');
    setMfaCode('');
    setError('');
    setIsWorking(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const run = async (getToken: () => Promise<string>) => {
    setIsWorking(true);
    setError('');
    try {
      const proof = await getToken();
      await onConfirmed(proof);
      close(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Vérification impossible'));
      setIsWorking(false);
    }
  };

  const confirmWithPasskey = () =>
    run(async () => {
      const { options, challenge_token } = await authApi.stepUpPasskeyBegin();
      const credential = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      return authApi.stepUpPasskeyComplete(challenge_token, credential);
    });

  const confirmWithPassword = (event: React.FormEvent) => {
    event.preventDefault();
    return run(() => authApi.stepUpWithPassword(password, needsTotp ? mfaCode : undefined));
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {warning && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        {hasPasskey && (
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={isWorking}
            onClick={confirmWithPasskey}
          >
            {isWorking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            Confirmer avec ma passkey
          </Button>
        )}

        {hasPasskey && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        <form onSubmit={confirmWithPassword} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="step-up-password">Votre mot de passe</Label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {needsTotp && (
            <div className="space-y-1.5">
              <Label htmlFor="step-up-mfa">Code de votre application</Label>
              <Input
                id="step-up-mfa"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              variant="destructive"
              className="flex-1 gap-2"
              disabled={isWorking || !password || (needsTotp && mfaCode.length < 6)}
            >
              {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </Button>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
