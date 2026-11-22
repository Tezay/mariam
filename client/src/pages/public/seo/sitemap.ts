interface SitemapOrg {
  slug: string;
  sites: { slug: string }[];
}

export function sitemapUrls(origin: string, organizations: SitemapOrg[]): string[] {
  return organizations.flatMap(({ slug, sites }) => [
    `${origin}/${slug}`,
    ...sites.map((site) => `${origin}/${slug}/${site.slug}`),
  ]);
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
