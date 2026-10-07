/**
 * Mounted once; a component reaches the prompt through `useStepUp()`.
 *
 * Offers only the second factors the account has. The password alone is never
 * offered: the server refuses it.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { AlertTriangle, Fingerprint, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/contexts/AuthContext';
import { StepUpContext, type ConfirmIdentity, type StepUpRequest } from '@/hooks/useStepUp';
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

export function StepUpProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Kept after closing, so the dialog does not empty while it animates out.
  const [request, setRequest] = useState<StepUpRequest | null>(null);
  const [asksFactor, setAsksFactor] = useState(true);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const settle = useRef<((confirmed: boolean) => void) | null>(null);

  const hasPasskey = (user?.passkeys_count ?? 0) > 0;
  const hasTotp = Boolean(user?.mfa_enabled);
  const destructive = request?.tone === 'destructive';
  const confirmLabel = request?.confirmLabel ?? 'Continuer';

  const finish = (confirmed: boolean) => {
    settle.current?.(confirmed);
    settle.current = null;
    setOpen(false);
    setPassword('');
    setMfaCode('');
    setError('');
    setIsWorking(false);
  };

  const confirmIdentity = useCallback<ConfirmIdentity>((next, forMs = 0) => {
    const confirmed = authApi.isConfirmed(forMs);
    if (confirmed && next.tone !== 'destructive') return Promise.resolve(true);
    return new Promise((resolve) => {
      // A prompt opened over another answers the first as backed out.
      settle.current?.(false);
      settle.current = resolve;
      setRequest(next);
      setAsksFactor(!confirmed);
      setOpen(true);
    });
  }, []);

  const run = async (confirm: () => Promise<void>) => {
    setIsWorking(true);
    setError('');
    try {
      await confirm();
      finish(true);
    } catch (err) {
      const cancelled = (err as { name?: string }).name === 'NotAllowedError';
      setError(
        cancelled
          ? 'Vérification annulée. Réessayez.'
          : getApiErrorMessage(err, 'Vérification impossible')
      );
      setIsWorking(false);
    }
  };

  const confirmWithPasskey = () =>
    run(async () => {
      const { options, challenge_token } = await authApi.stepUpPasskeyBegin();
      const credential = await startAuthentication({
        optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
      });
      await authApi.stepUpPasskeyComplete(challenge_token, credential);
    });

  const confirmWithPassword = (event: React.FormEvent) => {
    event.preventDefault();
    return run(() => authApi.stepUpWithPassword(password, mfaCode));
  };

  return (
    <StepUpContext.Provider value={confirmIdentity}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{request?.title ?? 'Confirmez votre identité'}</DialogTitle>
            {destructive ? (
              <DialogDescription className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{request?.description}</span>
              </DialogDescription>
            ) : (
              <DialogDescription>{request?.description}</DialogDescription>
            )}
          </DialogHeader>

          {asksFactor && destructive && (
            <p className="text-sm text-muted-foreground">
              Confirmez votre identité pour continuer.
            </p>
          )}

          {asksFactor && hasPasskey && (
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

          {asksFactor && hasPasskey && hasTotp && (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}

          {asksFactor && hasTotp ? (
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

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  variant={destructive ? 'destructive' : 'default'}
                  className="flex-1 gap-2"
                  disabled={isWorking || !password || mfaCode.length < 6}
                >
                  {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
                  {confirmLabel}
                </Button>
                <Button type="button" variant="outline" onClick={() => finish(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {asksFactor && !hasPasskey && (
                <p className="text-sm text-muted-foreground">
                  Cette action demande une double authentification. Configurez-la d'abord depuis Mon
                  compte.
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                {!asksFactor && (
                  <Button
                    variant={destructive ? 'destructive' : 'default'}
                    className="flex-1"
                    onClick={() => finish(true)}
                  >
                    {confirmLabel}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className={asksFactor ? 'w-full' : undefined}
                  onClick={() => finish(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {asksFactor && (hasPasskey || hasTotp) && (
            <p className="text-xs text-muted-foreground">
              Appareil perdu ? Un administrateur peut réinitialiser votre double authentification.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  );
}
