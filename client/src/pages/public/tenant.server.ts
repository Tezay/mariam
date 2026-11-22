import { createContext, data, type MiddlewareFunction } from 'react-router';
import type { PublicOrg, PublicSiteSummary } from '@/lib/api/sites';
import { fetchOrg, fetchSites, publicOrigin } from '@/lib/api/public.server';

export interface Tenant {
  organization: PublicOrg;
  sites: PublicSiteSummary[];
  origin: string;
}

export const tenantContext = createContext<Tenant>();

// Once per request, ahead of every public loader that needs the organization.
export const loadTenant: MiddlewareFunction<Response> = async ({ request, params, context }) => {
  const slug = params.org ?? '';
  let organization: PublicOrg | null;
  let sites: PublicSiteSummary[] | null;
  try {
    [organization, sites] = await Promise.all([fetchOrg(request, slug), fetchSites(request, slug)]);
  } catch (error) {
    console.error(error);
    throw data('unavailable', { status: 503 });
  }
  if (!organization || !sites) throw data('organization', { status: 404 });
  context.set(tenantContext, { organization, sites, origin: publicOrigin(request) });
};

export function siteFor(tenant: Tenant, slug: string | undefined): PublicSiteSummary {
  const site = tenant.sites.find((candidate) => candidate.slug === slug);
  if (!site) throw data('site', { status: 404 });
  return site;
}

export function sitePath(tenant: Tenant, site: string): string {
  return `/${tenant.organization.slug}/${site}`;
}
