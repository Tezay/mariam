import type { LoaderFunctionArgs } from 'react-router';
import { fetchDomain, fetchSites } from '@/lib/api/public.server';
import { siteManifest } from '@/lib/app-manifest';

export async function loader({ request }: LoaderFunctionArgs) {
  const slug = new URL(request.url).searchParams.get('site');
  let sites;
  try {
    const organization = await fetchDomain(request);
    sites = organization ? ((await fetchSites(request, organization.slug)) ?? []) : [];
  } catch (error) {
    console.error(error);
    return new Response(null, { status: 503, headers: { 'Retry-After': '60' } });
  }
  const site = sites.find((candidate) => candidate.slug === slug);
  if (!site) return new Response(null, { status: 404 });
  const pagePath = sites.length > 1 ? `/${site.slug}` : '/';
  return new Response(JSON.stringify(siteManifest(site.name, pagePath)), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
