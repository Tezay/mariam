/**
 * Director home: organization-wide metrics (aggregates + averages) and an
 * at-a-glance table of every site. More metrics will be added as features land.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, CalendarClock, Users } from 'lucide-react';
import { orgApi, type OrgSite } from '@/lib/api';
import { PageHeader, StatTile, StatusPill, EmptyState, PrimaryButton } from './ui';

export function OrgDashboardPage() {
  const [sites, setSites] = useState<OrgSite[] | null>(null);

  useEffect(() => {
    orgApi
      .getSites()
      .then(setSites)
      .catch(() => setSites([]));
  }, []);

  if (sites === null) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  const total = sites.length;
  const active = sites.filter((s) => s.is_active).length;
  const totalUsers = sites.reduce((a, s) => a + s.user_count, 0);
  const publishedToday = sites.filter((s) => s.today_menu_published).length;
  const upcomingEvents = sites.reduce((a, s) => a + s.upcoming_events, 0);
  const avgUsers = total ? (totalUsers / total).toFixed(1) : '0';
  const avgEvents = total ? (upcomingEvents / total).toFixed(1) : '0';

  return (
    <div>
      <PageHeader title="Vue d’ensemble" description="Activité de votre organisation" />

      {total === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun site pour le moment"
          description="Créez votre premier site pour commencer à en suivre l’activité."
          action={
            <Link to="/org/sites/new">
              <PrimaryButton>Créer un site</PrimaryButton>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Sites"
              value={total}
              hint={`${active} actif${active > 1 ? 's' : ''}`}
              icon={Building2}
            />
            <StatTile
              label="Menus du jour"
              value={`${publishedToday}/${total}`}
              hint="publiés aujourd’hui"
              icon={CheckCircle2}
            />
            <StatTile
              label="Événements à venir"
              value={upcomingEvents}
              hint={`${avgEvents} / site en moy.`}
              icon={CalendarClock}
            />
            <StatTile
              label="Utilisateurs"
              value={totalUsers}
              hint={`${avgUsers} / site en moy.`}
              icon={Users}
            />
          </div>

          <div className="mt-8">
            <h2 className="mb-3 text-sm font-medium text-foreground">Sites</h2>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Site</th>
                    <th className="px-4 py-2.5 font-medium">Statut</th>
                    <th className="px-4 py-2.5 text-right font-medium">Users</th>
                    <th className="px-4 py-2.5 text-center font-medium">Menu du jour</th>
                    <th className="px-4 py-2.5 text-right font-medium">Événements</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-border transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/org/sites/${s.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {s.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">/{s.slug}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill active={s.is_active} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.user_count}</td>
                      <td className="px-4 py-2.5 text-center">
                        {s.today_menu_published ? (
                          <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.upcoming_events}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
