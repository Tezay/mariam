import { Link, isRouteErrorResponse } from 'react-router';
import { PublicErrorFallback } from '@/components/ErrorBoundary';

// A 404 also comes from a proxy in front while a deployment recreates the containers:
// an outage, not a missing page.
const MISSING: Record<string, string> = {
  organization: 'Page introuvable.',
  site: 'Restaurant introuvable.',
};

export function PublicError({ error, org }: { error: unknown; org?: string }) {
  const kind =
    isRouteErrorResponse(error) && error.status === 404 && typeof error.data === 'string'
      ? error.data
      : '';
  const missing = MISSING[kind];
  if (!missing) return <PublicErrorFallback />;
  const back = kind === 'site' && org ? `/${org}` : '/';
  return (
    <div className="public-page flex h-screen flex-col items-center justify-center gap-3 p-6 text-center text-site-subtle">
      <p>{missing}</p>
      <Link to={back} className="font-semibold text-site-brand hover:underline">
        {kind === 'site' ? 'Voir les restaurants' : "Retour à l'accueil"}
      </Link>
    </div>
  );
}
