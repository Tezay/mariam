import { Link, Navigate } from 'react-router';
import { Building2, ChevronRight, Store } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { SIDEBAR_SCREEN } from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { landingPath, orgPath, placeGroups, readLastPlace, sitePath } from '@/lib/dashboard-routes';
import { roleLabel } from '@/lib/roles';

function PlaceLink({
  to,
  icon,
  name,
  detail,
}: {
  to: string;
  icon: React.ReactNode;
  name: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export function PlacesPage() {
  const { user, logout } = useAuth();
  const groups = user ? placeGroups(user) : [];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12">
      <Logo className="h-20 w-auto" />

      <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        {groups.length === 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Aucun restaurant pour le moment
            </h2>
            <p className="text-sm text-muted-foreground">
              Votre compte n'a accès à aucun restaurant. Demandez une invitation à l'administrateur
              du restaurant : son lien vous donnera l'accès.
            </p>
            <Button variant="outline" onClick={() => logout()}>
              Se déconnecter
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Où voulez-vous travailler ?</h2>
              <p className="text-sm text-muted-foreground">
                Vous pourrez en changer à tout moment depuis la barre latérale.
              </p>
            </div>
            {groups.map((group) => (
              <section key={group.organization.slug} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.organization.name}
                </h3>
                {group.supervised && (
                  <PlaceLink
                    to={orgPath(group.organization.slug)}
                    icon={<Building2 className="h-5 w-5" />}
                    name="Supervision"
                    detail="Tous les restaurants de l'organisation"
                  />
                )}
                {group.sites.map((site) => (
                  <PlaceLink
                    key={site.slug}
                    to={sitePath({ org: group.organization.slug, site: site.slug })}
                    icon={<Store className="h-5 w-5" />}
                    name={site.name}
                    detail={roleLabel(site.role)}
                  />
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function Landing() {
  const { user } = useAuth();
  const wide = useMediaQuery(SIDEBAR_SCREEN);
  const target = user && landingPath(user, wide ? readLastPlace() : null);
  return target ? <Navigate to={target} replace /> : <PlacesPage />;
}
