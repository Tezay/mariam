import { describe, expect, it } from 'vitest';
import {
  hostRedirect,
  hostsOf,
  legacyNeedsSites,
  legacyOrg,
  legacyTarget,
} from '@/lib/hosts.server';

const hosts = hostsOf({
  DASHBOARD_URL: 'https://app.example.test',
  PUBLIC_URL: 'https://example.test',
  LEGACY_HOSTS: 'crous.example.test',
});
const at = (address: string) => new URL(address);

describe('hostRedirect', () => {
  it('sends the dashboard to its own host', () => {
    expect(hostRedirect(at('http://example.test/admin/calendar?x=1'), hosts)).toBe(
      'https://app.example.test/admin/calendar?x=1'
    );
    expect(hostRedirect(at('http://example.test/crous/efrei'), hosts)).toBeNull();
  });

  it('sends a public page to the public host', () => {
    expect(hostRedirect(at('http://app.example.test/crous/efrei?date=2026-11-23'), hosts)).toBe(
      'https://example.test/crous/efrei?date=2026-11-23'
    );
    expect(hostRedirect(at('http://app.example.test/'), hosts)).toBe('/admin');
    expect(hostRedirect(at('http://app.example.test/login'), hosts)).toBeNull();
  });

  it('serves the shared files on either host', () => {
    for (const file of ['/config.js', '/robots.txt', '/sitemap.xml', '/app.webmanifest']) {
      expect(hostRedirect(at(`http://app.example.test${file}`), hosts)).toBeNull();
    }
  });

  it('leaves alone an unknown host, and an instance on one host', () => {
    expect(hostRedirect(at('http://10.0.0.5/admin'), hosts)).toBeNull();
    expect(hostRedirect(at('http://example.test/admin'), hostsOf({}))).toBeNull();
  });
});

describe('a former host', () => {
  const one = [{ slug: 'efrei' }];
  const two = [{ slug: 'efrei' }, { slug: 'nord' }];
  const target = (path: string, sites: { slug: string }[] | null = null) =>
    legacyTarget(at(`http://crous.example.test${path}`), 'crous', sites, hosts);

  it('names its organization by its first label', () => {
    expect(legacyOrg(at('http://crous.example.test/'), hosts)).toBe('crous');
    expect(legacyOrg(at('http://example.test/'), hosts)).toBeNull();
  });

  it('reads the sites only where a single site lived at the root', () => {
    expect(['/', '/menu', '/tv'].map((path) => legacyNeedsSites(at(`http://h${path}`)))).toEqual([
      true,
      true,
      true,
    ]);
    expect(legacyNeedsSites(at('http://h/efrei'))).toBe(false);
  });

  it.each([
    ['/', one, 'https://example.test/crous/efrei'],
    ['/?date=2026-11-23', one, 'https://example.test/crous/efrei?date=2026-11-23'],
    ['/?mode=tv', one, 'https://example.test/crous/efrei/tv'],
    ['/menu', one, 'https://example.test/crous/efrei'],
    ['/', two, 'https://example.test/crous'],
    ['/', null, 'https://example.test/crous'],
    ['/tv', one, 'https://example.test/crous/efrei/tv'],
    ['/tv', two, 'https://example.test/crous'],
    ['/nord', null, 'https://example.test/crous/nord'],
    ['/nord/menu?mode=tv', null, 'https://example.test/crous/nord/tv'],
    ['/nord/tv?rotation=90', null, 'https://example.test/crous/nord/tv?rotation=90'],
    ['/privacy', null, 'https://example.test/privacy'],
    ['/sitemap.xml', null, 'https://example.test/sitemap.xml'],
    ['/activate/abc', null, 'https://app.example.test/activate/abc'],
    ['/admin/calendar', null, 'https://app.example.test/admin/calendar'],
    ['/a/b/c', null, 'https://example.test/crous'],
  ])('leads %s to its new address', (path, sites, expected) => {
    expect(target(path, sites)).toBe(expected);
  });
});

describe('hostsOf', () => {
  it('refuses former hosts without a public one to send them to', () => {
    expect(() => hostsOf({ LEGACY_HOSTS: 'crous.example.test' })).toThrow('PUBLIC_URL');
  });
});
