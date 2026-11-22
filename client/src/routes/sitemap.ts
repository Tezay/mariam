import type { LoaderFunctionArgs } from 'react-router';
import { fetchOrgs, fetchSites, publicOrigin } from '@/lib/api/public.server';
import { hostsOf, isDashboardHost } from '@/lib/hosts.server';
import { sitemapUrls, sitemapXml } from '@/pages/public/seo/sitemap';

export async function loader({ request }: LoaderFunctionArgs) {
  if (isDashboardHost(new URL(request.url), hostsOf())) return new Response(null, { status: 404 });
  let organizations;
  try {
    organizations = await Promise.all(
      (await fetchOrgs(request)).map(async (organization) => ({
        slug: organization.slug,
        sites: (await fetchSites(request, organization.slug)) ?? [],
      }))
    );
  } catch (error) {
    console.error(error);
    // An empty sitemap would tell a crawler that the pages are gone.
    return new Response(null, { status: 503, headers: { 'Retry-After': '60' } });
  }
  return new Response(sitemapXml(sitemapUrls(publicOrigin(request), organizations)), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
