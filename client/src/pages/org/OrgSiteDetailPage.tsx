/**
 * Director view of a single site: its metrics, its week of menus and its users.
 * Read-only — a site's name and activation are contract matters handled by
 * Mariam, not by the organization's supervisor.
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, CalendarClock, CheckCircle2 } from 'lucide-react';
import { orgApi, adminApi, type OrgSite, type User } from '@/lib/api';
import { StatTile, StatusPill, PrimaryButton } from './ui';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { RoleBadge } from '@/components/dashboard/RoleBadge';
import { DataTable, type DataTableColumn } from '@/components/dashboard/DataTable';
import { SiteWeekCalendar } from './site/SiteWeekCalendar';

const SITE_USER_COLUMNS: DataTableColumn<User>[] = [
  {
    key: 'email',
    header: 'Email',
    render: (user) => <span className="font-medium">{user.email}</span>,
    sortValue: (user) => user.email,
  },
  {
    key: 'role',
    header: 'Rôle',
    render: (user) => <RoleBadge role={user.role} />,
    sortValue: (user) => user.role,
  },
  {
    key: 'status',
    header: 'Statut',
    render: (user) => <StatusPill active={user.is_active} />,
    sortValue: (user) => (user.is_active ? 1 : 0),
  },
];

export function OrgSiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const siteId = Number(id);
  const [site, setSite] = useState<OrgSite | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([orgApi.getSites(), adminApi.listUsers()])
      .then(([sites, allUsers]: [OrgSite[], User[]]) => {
        const s = sites.find((x) => x.id === siteId) ?? null;
        setSite(s);
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
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            {site.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">/{site.slug}</p>
        </div>
        <StatusPill active={site.is_active} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile label="Comptes" value={site.user_count} icon={Users} />
        <StatTile label="Événements à venir" value={site.upcoming_events} icon={CalendarClock} />
        <StatTile
          label="Menu du jour"
          value={site.today_menu_published ? 'Publié' : 'Non publié'}
          icon={CheckCircle2}
        />
      </div>

      <div className="mt-8">
        <SiteWeekCalendar siteId={site.id} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-foreground">Comptes de ce site</h2>
        <DataTable
          rows={users}
          columns={SITE_USER_COLUMNS}
          rowKey={(user) => user.id}
          defaultSortKey="email"
          defaultAscending
          minWidthClassName="min-w-[420px]"
          emptyState={
            <EmptyState
              icon={Users}
              title="Aucun utilisateur"
              description="Invitez un gestionnaire à ce site depuis la page Utilisateurs."
            />
          }
        />
      </div>
    </div>
  );
}
