import type { LoaderFunctionArgs } from 'react-router';
import { fetchPublicOrg, publicOrigin } from '@/lib/api/public.server';
import { sitemapUrls, sitemapXml } from '@/pages/public/seo/sitemap';

export async function loader({ request }: LoaderFunctionArgs) {
  let sites;
  try {
    sites = (await fetchPublicOrg(request))?.sites ?? [];
  } catch (error) {
    console.error(error);
    // An empty sitemap would tell a crawler that the pages are gone.
    return new Response(null, { status: 503, headers: { 'Retry-After': '60' } });
  }
  return new Response(sitemapXml(sitemapUrls(publicOrigin(request), sites)), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
