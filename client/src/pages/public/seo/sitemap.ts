import type { PublicSiteSummary } from '@/lib/api/sites';

export function sitemapUrls(origin: string, sites: PublicSiteSummary[]): string[] {
  if (sites.length === 0) return [];
  if (sites.length === 1) return [`${origin}/`];
  return [`${origin}/`, ...sites.map((site) => `${origin}/${site.slug}`)];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sitemapXml(urls: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`).join('') +
    '</urlset>'
  );
}
