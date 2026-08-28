/**
 * Site-level statistics. Renders the same analytics views as the director
 * dashboard; the API scopes them to the caller's own site, so nothing here
 * needs to know whether the organization has one site or thirty.
 */
import { PublicationsView } from '@/features/analytics/PublicationsView';

export function StatsPage() {
  return (
    <div className="container-mariam py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Statistiques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suivez la publication de vos menus et la qualité de vos contenus.
        </p>
      </div>
      <PublicationsView />
    </div>
  );
}
