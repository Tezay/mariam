import { createContext, data, redirect, type MiddlewareFunction } from 'react-router';
import type { PublicOrg } from '@/lib/api/public';
import { fetchPublicOrg, publicOrigin } from '@/lib/api/public.server';

export interface Tenant extends PublicOrg {
  origin: string;
}

export const tenantContext = createContext<Tenant>();

// Once per request, ahead of every public loader that needs the organization.
export const loadTenant: MiddlewareFunction<Response> = async ({ request, context }) => {
  let org: PublicOrg | null;
  try {
    org = await fetchPublicOrg(request);
  } catch (error) {
    console.error(error);
    throw data('unavailable', { status: 503 });
  }
  if (!org) throw data('organization', { status: 404 });
  context.set(tenantContext, { ...org, origin: publicOrigin(request) });
};

// A single site lives at /menu, several at /<site>/menu. The query survives the
// redirection, which /<site>/menu?mode=tv needs to reach the display.
export function siteFor(tenant: Tenant, request: Request, slug: string | undefined, page: string) {
  const multiSite = tenant.sites.length > 1;
  if (!slug && multiSite) throw redirect('/');
  const site = slug ? tenant.sites.find((s) => s.slug === slug) : tenant.sites[0];
  if (!site) throw data('site', { status: 404 });
  if (slug && !multiSite) throw redirect(`/${page}${new URL(request.url).search}`);
  return { site, multiSite };
}
