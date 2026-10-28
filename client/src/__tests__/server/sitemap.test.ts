import { describe, it, expect } from 'vitest';
import { sitemapUrls, sitemapXml } from '@/pages/public/seo/sitemap';

const site = (slug: string) => ({ slug, name: slug });

describe('sitemapUrls', () => {
  it('lists nothing for an organization without a site', () => {
    expect(sitemapUrls('https://demo.example.test', [])).toEqual([]);
  });

  it('serves a single site at the root', () => {
    expect(sitemapUrls('https://demo.example.test', [site('solo')])).toEqual([
      'https://demo.example.test/',
    ]);
  });

  it('lists the root, then each site under its slug', () => {
    expect(sitemapUrls('https://demo.example.test', [site('alpha'), site('beta')])).toEqual([
      'https://demo.example.test/',
      'https://demo.example.test/alpha',
      'https://demo.example.test/beta',
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
