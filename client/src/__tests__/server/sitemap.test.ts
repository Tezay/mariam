import { describe, it, expect } from 'vitest';
import { sitemapUrls, sitemapXml } from '@/pages/public/seo/sitemap';

describe('sitemapUrls', () => {
  it('lists each organization, then each of its sites', () => {
    const organizations = [
      { slug: 'crous', sites: [{ slug: 'alpha' }, { slug: 'beta' }] },
      { slug: 'other', sites: [] },
    ];

    expect(sitemapUrls('https://example.test', organizations)).toEqual([
      'https://example.test/crous',
      'https://example.test/crous/alpha',
      'https://example.test/crous/beta',
      'https://example.test/other',
    ]);
  });
});

describe('sitemapXml', () => {
  it('escapes what XML reserves', () => {
    expect(sitemapXml(['https://demo.example.test/?a=1&b=<2>'])).toContain(
      '<loc>https://demo.example.test/?a=1&amp;b=&lt;2&gt;</loc>'
    );
  });
});
