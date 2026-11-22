import { redirect, type MiddlewareFunction } from 'react-router';
import { fetchSites } from '@/lib/api/public.server';
import {
  hostRedirect,
  hostsOf,
  legacyNeedsSites,
  legacyOrg,
  legacyTarget,
} from '@/lib/hosts.server';

// Read once, on import: a setting that cannot work stops the server at start.
const hosts = hostsOf();

export const redirectHosts: MiddlewareFunction<Response> = async ({ request }) => {
  const url = new URL(request.url);
  const org = legacyOrg(url, hosts);
  if (org) {
    const sites = legacyNeedsSites(url) ? await fetchSites(request, org).catch(() => null) : null;
    throw redirect(legacyTarget(url, org, sites, hosts), 301);
  }
  const target = hostRedirect(url, hosts);
  if (target) throw redirect(target, 301);
};
