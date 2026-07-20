/**
 * Director view: the organization's sites as a clean list; each row opens the
 * site detail. Creation happens on a dedicated page.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, ChevronRight } from 'lucide-react';
import { orgApi, type OrgSite } from '@/lib/api';
import { PageHeader, StatusPill, EmptyState, PrimaryButton } from './ui';

export function OrgSitesPage() {
  const [sites, setSites] = useState<OrgSite[] | null>(null);

  useEffect(() => {
    orgApi
      .getSites()
      .then(setSites)
      .catch(() => setSites([]));
  }, []);

  const newSiteButton = (
    <Link to="/org/sites/new">
      <PrimaryButton>
        <Plus className="h-4 w-4" />
        Nouveau site
      </PrimaryButton>
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Les restaurants de votre organisation"
        action={newSiteButton}
      />

      {sites === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : sites.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun site"
          description="Créez un site pour lui affecter des gestionnaires et publier ses menus."
          action={newSiteButton}
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {sites.map((s) => (
            <Link
              key={s.id}
              to={`/org/sites/${s.id}`}
              className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  /{s.slug} · {s.user_count} utilisateur{s.user_count > 1 ? 's' : ''} ·{' '}
                  {s.upcoming_events} événement{s.upcoming_events > 1 ? 's' : ''}
                </div>
              </div>
              <StatusPill active={s.is_active} />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
