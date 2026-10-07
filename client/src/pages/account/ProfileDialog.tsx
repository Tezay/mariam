import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStepUp } from '@/hooks/useStepUp';
import { authApi } from '@/lib/api/auth';
import { getApiErrorMessage } from '@/lib/api/errors';
import { DISPLAY_NAME_RULE, parseDisplayName } from '@/lib/display-name';
import { EMAIL_RULE, canonicalEmail } from '@/lib/email-address';
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

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, refreshUser } = useAuth();
  const confirmIdentity = useStepUp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(user?.username ?? '');
    setEmail(user?.email ?? '');
    setError('');
  }, [open, user?.username, user?.email]);

  const displayName = parseDisplayName(name);
  const address = canonicalEmail(email);
  const changes: { username?: string; email?: string } = {};
  if (displayName && displayName !== user?.username) changes.username = displayName;
  if (address && address !== user?.email) changes.email = address;
  const canSave = Boolean(displayName && address) && Object.keys(changes).length > 0;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!(await confirmIdentity({ description: 'Pour modifier votre profil.' }))) return;

    setIsSaving(true);
    try {
      await authApi.updateProfile(changes);
    } catch (err) {
      setError(getApiErrorMessage(err, "L'enregistrement a échoué"));
      return;
    } finally {
      setIsSaving(false);
    }

    if (changes.email) {
      notify.success('Adresse modifiée', `Connectez-vous désormais avec ${changes.email}.`);
    } else {
      notify.success('Profil mis à jour');
    }
    onOpenChange(false);
    // Saved already: a failure to re-read the profile must not read as a failed save.
    refreshUser().catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier mon profil</DialogTitle>
          <DialogDescription>
            Votre nom, et l'adresse avec laquelle vous vous connectez.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="profile-name">Prénom et nom</Label>
            <Input
              id="profile-name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="mt-1"
            />
            {name && !displayName ? (
              <p className="mt-1 text-sm text-destructive">{DISPLAY_NAME_RULE}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Visible par les utilisateurs.</p>
            )}
          </div>

          <div>
            <Label htmlFor="profile-email">Adresse e-mail</Label>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={user?.is_rescue_account}
              className="mt-1"
            />
            {user?.is_rescue_account ? (
              <p className="mt-1 text-sm text-muted-foreground">
                L'adresse de ce compte est gérée par le support.
              </p>
            ) : email && !address ? (
              <p className="mt-1 text-sm text-destructive">{EMAIL_RULE}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Elle sert à vous connecter.</p>
            )}
          </div>

          {changes.email && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              Vous vous connecterez désormais avec cette adresse. Vos autres appareils seront
              déconnectés et un message d'alerte sera envoyé à l'ancienne adresse.
            </p>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave || isSaving}>
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
