const PRIVATE_PATHS = [
  '/admin',
  '/org',
  '/login',
  '/activate',
  '/reset-password',
  '/notifications',
  '/v1/',
];

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
