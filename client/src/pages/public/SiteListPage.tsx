/**
 * Public root for a multi-site organization: lists the sites, each linking to
 * its menu at /:slug/menu. Light mode only (public page).
 */
import { Link } from 'react-router-dom';
import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useDocumentMeta } from '@/lib/use-document-meta';

export function SiteListPage() {
  const { organization, sites } = useTenant();

  useDocumentMeta({
    title: organization ? `${organization.name} — Nos restaurants` : undefined,
    description: organization
      ? `Découvrez les menus des restaurants de ${organization.name}.`
      : undefined,
  });

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-10 font-sans">
      <div className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">{organization?.name}</h1>
          <p className="mt-1 text-slate-500">Choisissez un restaurant</p>
        </header>

        <ul className="space-y-3">
          {sites.map((site) => (
            <li key={site.slug}>
              <Link
                to={`/${site.slug}/menu`}
                className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
                  {site.logo_url ? (
                    <img src={site.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UtensilsCrossed className="h-6 w-6 text-primary" />
                  )}
                </div>
                <span className="flex-1 font-semibold text-slate-900">{site.name}</span>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
