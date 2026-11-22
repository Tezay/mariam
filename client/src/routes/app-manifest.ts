import type { LoaderFunctionArgs } from 'react-router';
import { fetchSites } from '@/lib/api/public.server';
import { siteManifest } from '@/lib/app-manifest';

export async function loader({ request }: LoaderFunctionArgs) {
  const query = new URL(request.url).searchParams;
  const org = query.get('org') ?? '';
  let sites;
  try {
    sites = org ? ((await fetchSites(request, org)) ?? []) : [];
  } catch (error) {
    console.error(error);
    return new Response(null, { status: 503, headers: { 'Retry-After': '60' } });
  }
  const site = sites.find((candidate) => candidate.slug === query.get('site'));
  if (!site) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(siteManifest(site.name, org, site.slug)), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
