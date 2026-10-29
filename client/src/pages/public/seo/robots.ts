// The API stays open to crawlers, which fetch it to render the pages; its
// responses carry X-Robots-Tag: noindex.
const PRIVATE_PATHS = ['/admin', '/org', '/login', '/activate', '/reset-password', '/unsubscribe'];

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    '',
    // Common Crawl feeds bulk scrapers.
    'User-agent: CCBot',
    'Disallow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}
