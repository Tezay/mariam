import { useEffect } from 'react';
import { Link } from 'react-router';
import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { useTenant } from './tenant';
import { trackPageView } from '@/lib/telemetry';

export function SiteListPage() {
  const { organization, sites } = useTenant();

  useEffect(() => {
    trackPageView('sites', organization.slug);
  }, [organization.slug]);

  return (
    <div className="public-page flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{organization.name}</h1>
          <p className="mt-1 text-site-subtle">Choisissez un restaurant</p>
        </header>

        <ul className="space-y-3">
          {sites.map((site) => (
            <li key={site.slug}>
              <Link
                to={`/${site.slug}`}
                className="flex items-center gap-4 rounded-3xl border border-site-line bg-site-surface p-4 transition-colors hover:border-site-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-site-brand"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-site-brand-soft">
                  {site.logo_url ? (
                    <img
                      src={site.logo_url}
                      alt=""
                      className="h-full w-full bg-white object-contain p-1"
                    />
                  ) : (
                    <UtensilsCrossed className="h-6 w-6 text-site-brand" />
                  )}
                </div>
                <span className="flex-1 font-semibold">{site.name}</span>
                <ChevronRight className="h-5 w-5 text-site-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
