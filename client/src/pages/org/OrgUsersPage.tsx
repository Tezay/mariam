/**
 * Director view: the users of every site of the organization. Invitations target
 * a chosen site (sent as restaurant_id, validated server-side).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, RotateCcw, Trash2, Users } from 'lucide-react';
import { adminApi, restaurantApi, getApiErrorMessage, type User, type AdminSite } from '@/lib/api';
import { notify } from '@/lib/toast';
import { PageHeader, StatusPill, EmptyState, PrimaryButton, inputClass } from './ui';

type InviteRole = 'admin' | 'editor' | 'reader';

export function OrgUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState<{ email: string; role: InviteRole; restaurantId: number | '' }>({
    email: '',
    role: 'editor',
    restaurantId: '',
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([adminApi.listUsers(), restaurantApi.list()])
      .then(([u, s]) => {
        setUsers(u);
        setSites(s);
      })
      .catch(() => notify.error('Chargement impossible'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const siteName = (id?: number | null) => sites.find((s) => s.id === id)?.name ?? '—';

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.restaurantId) {
      notify.error('Email et site requis');
      return;
    }
    try {
      const inv = await adminApi.createInvitation(
        form.email.trim(),
        form.role,
        Number(form.restaurantId)
      );
      setInviteLink(`${window.location.origin}/activate/${inv.token}`);
      setForm({ email: '', role: 'editor', restaurantId: '' });
      notify.success('Invitation créée');
      load();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Invitation impossible'));
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await adminApi.updateUser(u.id, { is_active: !u.is_active });
      load();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Action impossible'));
    }
  };

  const resetMfa = async (u: User) => {
    if (!confirm(`Réinitialiser le MFA de ${u.email} ?`)) return;
    try {
      await adminApi.resetUserMfa(u.id);
      notify.success('MFA réinitialisé');
      load();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Action impossible'));
    }
  };

  const remove = async (u: User) => {
    if (!confirm(`Supprimer ${u.email} ?`)) return;
    try {
      await adminApi.deleteUser(u.id);
      notify.success('Utilisateur supprimé');
      load();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Suppression impossible'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description="Tous les sites de votre organisation"
        action={
          <PrimaryButton onClick={() => setShowInvite((s) => !s)}>
            <UserPlus className="h-4 w-4" />
            Inviter
          </PrimaryButton>
        }
      />

      {showInvite && (
        <form
          onSubmit={invite}
          className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4"
        >
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            className={`${inputClass} sm:col-span-2`}
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as InviteRole })}
            className={inputClass}
          >
            <option value="editor">Éditeur</option>
            <option value="admin">Admin</option>
            <option value="reader">Lecteur</option>
          </select>
          <select
            value={form.restaurantId}
            onChange={(e) => setForm({ ...form, restaurantId: Number(e.target.value) })}
            className={inputClass}
          >
            <option value="">Site…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end sm:col-span-4">
            <PrimaryButton type="submit">Créer l’invitation</PrimaryButton>
          </div>
        </form>
      )}

      {inviteLink && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="mb-1 font-medium text-foreground">Lien d’activation (à transmettre) :</p>
          <code className="block break-all text-xs text-muted-foreground">{inviteLink}</code>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun utilisateur"
          description="Invitez un premier gestionnaire."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Rôle</th>
                <th className="px-4 py-2.5 font-medium">Site</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-border transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5 text-foreground">{u.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.role}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{siteName(u.restaurant_id)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => toggleActive(u)} title="Basculer le statut">
                      <StatusPill active={u.is_active} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => resetMfa(u)}
                        title="Réinitialiser le MFA"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(u)}
                        title="Supprimer"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
