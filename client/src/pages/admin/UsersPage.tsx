/**
 * MARIAM - Page de gestion des utilisateurs
 *
 * Permet aux admins de :
 * - Voir la liste des utilisateurs
 * - Inviter de nouveaux utilisateurs
 * - Modifier les rôles
 * - Désactiver/réactiver des comptes
 * - Réinitialiser le MFA
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
import { adminApi, type Invitation } from '@/lib/api/admin';
import { restaurantApi, AdminSite } from '@/lib/api/restaurant';
import { getApiErrorMessage } from '@/lib/api/errors';
import { EMAIL_RULE, canonicalEmail } from '@/lib/email-address';
import { User } from '@/lib/api/auth';
import { notify } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES, SITE_ROLES } from '@/lib/roles';
import { RoleBadge } from '@/components/dashboard/RoleBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { useStepUp } from '@/hooks/useStepUp';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/dashboard/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  Ban,
  UserPlus,
  Eye,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  X,
  Users as UsersIcon,
  MoreHorizontal,
  SlidersHorizontal,
  Mail,
  Link as LinkIcon,
} from 'lucide-react';

const INVITATION_CONFIRMATION = { description: 'Pour inviter un nouvel utilisateur.' };

// The API sends UTC without an offset.
const expiryDate = (expiresAt: string) =>
  new Date(`${expiresAt}Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const confirmIdentity = useStepUp();
  const isOrgScope = currentUser?.role === 'org_admin';
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [revokingInvitation, setRevokingInvitation] = useState<Invitation | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Charger les données
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersData, invitationsData, sitesData] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listInvitations(),
        isOrgScope ? restaurantApi.list() : Promise.resolve([]),
      ]);
      setUsers(usersData);
      setSites(sitesData);
      setInvitations(invitationsData);
    } catch {
      notify.error('Erreur lors du chargement des utilisateurs');
    } finally {
      setIsLoading(false);
    }
  }, [isOrgScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Copier le lien d'invitation
  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/activate/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const openInvitation = async () => {
    if (await confirmIdentity(INVITATION_CONFIRMATION)) {
      setShowInviteModal(true);
    }
  };

  const handleDeleteUser = async (target: User) => {
    const confirmed = await confirmIdentity({
      title: `Supprimer ${target.username || target.email}`,
      description:
        "Cette action est irréversible : le compte et ses accès sont supprimés. L'historique d'audit est conservé.",
      confirmLabel: 'Supprimer définitivement',
      tone: 'destructive',
    });
    if (!confirmed) return;
    try {
      await adminApi.deleteUser(target.id);
      setUsers((previous) => previous.filter((u) => u.id !== target.id));
      notify.success(`Compte ${target.email} supprimé`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'La suppression a échoué'));
    }
  };

  const handleResetMfa = async (target: User) => {
    const name = target.username || target.email;
    const confirmed = await confirmIdentity({
      title: `Réinitialiser la double authentification de ${name}`,
      description:
        "Son application d'authentification et ses passkeys seront supprimées, et ses appareils déconnectés. À sa prochaine connexion, ce compte devra en configurer de nouvelles avec son mot de passe.",
      confirmLabel: 'Réinitialiser',
      tone: 'destructive',
    });
    if (!confirmed) return;
    try {
      await adminApi.resetUserMfa(target.id);
      notify.success(
        'Double authentification réinitialisée',
        `Prévenez ${name} : une nouvelle connexion est nécessaire.`
      );
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'La réinitialisation a échoué'));
    }
  };

  const handleRevokeInvitation = async () => {
    if (!revokingInvitation) return;
    try {
      await adminApi.revokeInvitation(revokingInvitation.id);
      setInvitations((previous) => previous.filter((inv) => inv.id !== revokingInvitation.id));
      notify.success('Invitation révoquée', 'Son lien ne fonctionne plus.');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'La révocation a échoué'));
    } finally {
      setRevokingInvitation(null);
    }
  };

  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);

  // A supervisor manages its peers only: site accounts belong to their site.
  const canManage = useCallback(
    (target: User) => (isOrgScope ? target.role === 'org_admin' : target.role !== 'org_admin'),
    [isOrgScope]
  );

  const supervisors = useMemo(() => users.filter((u) => u.role === 'org_admin'), [users]);
  const siteUsers = useMemo(() => users.filter((u) => u.role !== 'org_admin'), [users]);

  const columns = useMemo<DataTableColumn<User>[]>(() => {
    const base: DataTableColumn<User>[] = [
      {
        key: 'name',
        header: 'Utilisateur',
        render: (user) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {(user.username || user.email).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{user.username || user.email}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        ),
        sortValue: (user) => user.username || user.email,
      },
      {
        key: 'role',
        header: 'Rôle',
        render: (user) => <RoleBadge role={user.role} />,
        sortValue: (user) => user.role,
      },
    ];

    if (isOrgScope) {
      base.push({
        key: 'site',
        header: 'Site',
        render: (user) => (
          <span className="text-muted-foreground">
            {siteNames.get(user.restaurant_id ?? -1) ?? '—'}
          </span>
        ),
        sortValue: (user) => (user.restaurant_id ? (siteNames.get(user.restaurant_id) ?? '') : ''),
      });
    }

    base.push(
      {
        key: 'status',
        header: 'Statut',
        render: (user) =>
          user.is_active ? (
            <span className="text-xs text-muted-foreground">Actif</span>
          ) : (
            <span className="whitespace-nowrap rounded-full bg-yellow-500/10 px-2 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
              Inactif
            </span>
          ),
        sortValue: (user) => (user.is_active ? 1 : 0),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        className: 'w-[56px]',
        render: (user) =>
          canManage(user) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Actions du compte">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={() => setEditingUser(user)} className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Rôle et accès
                </DropdownMenuItem>
                {user.id !== currentUser?.id && (
                  <>
                    <DropdownMenuItem onClick={() => handleResetMfa(user)} className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Réinitialiser la double authentification
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleDeleteUser(user)}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer le compte
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      }
    );

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrgScope, siteNames, users, canManage, currentUser?.id]);

  const supervisorColumns = useMemo(
    () => columns.filter((column) => column.key !== 'site'),
    [columns]
  );

  return (
    <div className="container-mariam py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Utilisateurs</h1>
          <p className="text-muted-foreground">Gérez les accès à l'interface d'administration</p>
        </div>
        <Button onClick={openInvitation} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Inviter
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {isOrgScope && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Supervision ({supervisors.length})
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ces comptes suivent tous les sites et n'en modifient aucun.
                </p>
              </div>
              <DataTable
                rows={supervisors}
                columns={supervisorColumns}
                rowKey={(user) => user.id}
                defaultSortKey="name"
                defaultAscending
                minWidthClassName="min-w-[520px]"
                emptyState={
                  <EmptyState
                    icon={Eye}
                    title="Aucun superviseur"
                    description="Invitez un collègue pour partager le suivi de vos sites."
                  />
                }
              />
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {isOrgScope
                ? `Comptes des sites (${siteUsers.length})`
                : `Comptes actifs (${siteUsers.length})`}
            </h2>
            <DataTable
              rows={siteUsers}
              columns={columns}
              rowKey={(user) => user.id}
              defaultSortKey="name"
              defaultAscending
              emptyState={
                <EmptyState
                  icon={UsersIcon}
                  title="Aucun compte"
                  description="Invitez un premier compte pour donner accès au dashboard."
                />
              }
            />
          </section>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Un changement d'accès particulier ? Écrivez-nous à{' '}
            <a
              href="mailto:contact@mariam.app"
              className="font-medium text-foreground hover:underline"
            >
              contact@mariam.app
            </a>
          </p>

          {/* Invitations en attente */}
          {invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LinkIcon className="h-5 w-5" />
                  Invitations en attente ({invitations.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {invitations.map((inv) => (
                    <div
                      key={inv.token}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">
                            {inv.email ?? 'Invitation sans adresse'}
                          </p>
                          <RoleBadge role={inv.role} className="shrink-0" />
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {inv.created_by_name
                            ? `Créée par ${inv.created_by_name} · expire le `
                            : 'Expire le '}
                          {expiryDate(inv.expires_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(inv.token)}
                          className="flex-1 gap-2 sm:flex-none"
                        >
                          {copiedToken === inv.token ? (
                            <>
                              <Check className="h-4 w-4 text-green-500" />
                              Copié
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Copier le lien
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokingInvitation(inv)}
                          className="flex-1 gap-2 text-destructive hover:text-destructive sm:flex-none"
                        >
                          <Ban className="h-4 w-4" />
                          Révoquer
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AlertDialog
        open={Boolean(revokingInvitation)}
        onOpenChange={(open) => !open && setRevokingInvitation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer cette invitation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le lien cessera de fonctionner immédiatement. Vous pourrez en créer un nouveau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeInvitation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal d'invitation */}
      {showInviteModal && (
        <InviteModal
          isOrgScope={isOrgScope}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            loadData();
          }}
        />
      )}

      {/* Modal d'édition */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// Modal d'invitation
function InviteModal({
  onClose,
  onSuccess,
  isOrgScope,
}: {
  onClose: () => void;
  onSuccess: () => void;
  isOrgScope: boolean;
}) {
  const confirmIdentity = useStepUp();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'reader'>('editor');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ token: string } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const suggested = email.trim() ? canonicalEmail(email) : undefined;
    if (suggested === null) {
      setError(EMAIL_RULE);
      return;
    }

    // The confirmation asked on opening may have lapsed while the form was filled.
    if (!(await confirmIdentity(INVITATION_CONFIRMATION))) return;

    setIsLoading(true);
    try {
      const invitation = await adminApi.createInvitation(
        isOrgScope ? 'org_admin' : role,
        suggested
      );
      setResult({ token: invitation.token });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erreur lors de la création'));
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = () => {
    if (result) {
      navigator.clipboard.writeText(`${window.location.origin}/activate/${result.token}`);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {isOrgScope ? 'Inviter un superviseur' : 'Inviter un utilisateur'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-500/10 p-4 text-green-600 dark:text-green-400">
              <p className="font-medium">Invitation créée</p>
              <p className="mt-1 text-sm">
                Envoyez ce lien à la personne concernée. Il est valable 72 h et ne fonctionne qu'une
                fois.
              </p>
            </div>
            <div className="break-all rounded-lg bg-muted p-3 text-sm text-foreground">
              {window.location.origin}/activate/{result.token}
            </div>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Toute personne qui possède ce lien peut créer le compte : ne le transmettez qu'à elle.
            </p>
            <div className="flex gap-2">
              <Button onClick={copyLink} className="flex-1 gap-2">
                <Copy className="h-4 w-4" />
                Copier le lien
              </Button>
              <Button variant="outline" onClick={onSuccess}>
                Fermer
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Adresse e-mail (facultatif)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Elle préremplit le formulaire de la personne invitée, qui pourra la modifier.
              </p>
            </div>

            {isOrgScope ? (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Superviseur</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ce compte suivra tous les sites de votre organisation, sans pouvoir en modifier
                    le contenu. Pour un accès à un site précis, contactez son administrateur.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <Label>Rôle</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {SITE_ROLES.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRole(key as 'admin' | 'editor' | 'reader')}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        role === key
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {(() => {
                          const Icon = ROLES[key].icon;
                          return <Icon className="h-4 w-4 text-muted-foreground" />;
                        })()}
                        <span className="text-sm font-medium text-foreground">
                          {ROLES[key].label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{ROLES[key].description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? 'Création...' : "Créer l'invitation"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

// Modal d'édition utilisateur
function EditUserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await adminApi.updateUser(
        user.id,
        user.role === 'org_admin' ? { is_active: isActive } : { role, is_active: isActive }
      );
      onSuccess();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Erreur lors de la modification'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Rôle et accès — {user.username || user.email}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {user.role === 'org_admin' ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <RoleBadge role={user.role} />
              <span className="text-xs text-muted-foreground">
                Le rôle d'un superviseur n'est pas modifiable.
              </span>
            </div>
          ) : (
            <div>
              <Label>Niveau d'accès</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {SITE_ROLES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRole(key)}
                    className={`rounded-lg border p-3 text-center transition-all ${
                      role === key
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <RoleBadge role={key} />
                    <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground">
                      {ROLES[key].description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Connexion autorisée</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Un compte suspendu conserve ses données mais ne peut plus se connecter.
              </p>
            </div>
            <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
