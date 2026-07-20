/**
 * Director view of a single site: its metrics, its users, and quick actions
 * (rename, activate/deactivate). Future per-site features will hang off here.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, CalendarClock, CheckCircle2, Pencil } from 'lucide-react';
import {
  orgApi,
  adminApi,
  restaurantApi,
  getApiErrorMessage,
  type OrgSite,
  type User,
} from '@/lib/api';
import { notify } from '@/lib/toast';
import { StatTile, StatusPill, EmptyState, PrimaryButton, inputClass } from './ui';

export function OrgSiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const siteId = Number(id);
  const [site, setSite] = useState<OrgSite | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([orgApi.getSites(), adminApi.listUsers()])
      .then(([sites, allUsers]: [OrgSite[], User[]]) => {
        const s = sites.find((x) => x.id === siteId) ?? null;
        setSite(s);
        setName(s?.name ?? '');
        setUsers(allUsers.filter((u) => u.restaurant_id === siteId));
      })
      .catch(() => setSite(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, [siteId]);

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (!site) {
    return (
      <EmptyState
        icon={Building2}
        title="Site introuvable"
        action={
          <Link to="/org/sites">
            <PrimaryButton>Retour aux sites</PrimaryButton>
          </Link>
        }
      />
    );
  }

  const toggle = async () => {
    try {
      await restaurantApi.setActive(site.id, !site.is_active);
      load();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Action impossible'));
    }
  };

  const rename = async () => {
    if (!name.trim()) return;
    try {
      await restaurantApi.update(site.id, { name: name.trim() });
      notify.success('Site renommé');
      setRenaming(false);
      load();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Renommage impossible'));
    }
  };

  return (
    <div>
      <Link
        to="/org/sites"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Sites
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                autoFocus
              />
              <PrimaryButton onClick={rename}>Enregistrer</PrimaryButton>
              <button
                onClick={() => {
                  setRenaming(false);
                  setName(site.name);
                }}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{site.name}</h1>
              <button
                onClick={() => setRenaming(true)}
                title="Renommer"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="mt-1 text-sm text-muted-foreground">/{site.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill active={site.is_active} />
          <button
            onClick={toggle}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {site.is_active ? 'Désactiver' : 'Activer'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile label="Utilisateurs" value={site.user_count} icon={Users} />
        <StatTile label="Événements à venir" value={site.upcoming_events} icon={CalendarClock} />
        <StatTile
          label="Menu du jour"
          value={site.today_menu_published ? 'Publié' : 'Non publié'}
          icon={CheckCircle2}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-foreground">Utilisateurs de ce site</h2>
        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aucun utilisateur"
            description="Invitez un gestionnaire à ce site depuis la page Utilisateurs."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Rôle</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-2.5 text-foreground">{u.email}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.role}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill active={u.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
