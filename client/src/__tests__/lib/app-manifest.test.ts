import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appIdentity, DASHBOARD_APPS, siteManifest } from '@/lib/app-manifest';

const publicDir = path.resolve(import.meta.dirname, '../../../public');
const SITE = { org: 'crous', slug: 'sciences', name: 'Restaurant des Sciences' };

describe('appIdentity', () => {
  it('names the app of each context', () => {
    expect(appIdentity('/admin/calendar', SITE).manifest).toBe('/manifest-admin.webmanifest');
    expect(appIdentity('/admin', null).title).toBe('Gestion');
    expect(appIdentity('/org/sites/sciences', null).manifest).toBe('/manifest-org.webmanifest');
    expect(appIdentity('/crous/sciences', SITE)).toEqual({
      manifest: '/app.webmanifest?org=crous&site=sciences',
      title: 'Restaurant des Sciences',
    });
  });

  it('installs nothing from a page that is no app', () => {
    for (const pathname of ['/', '/privacy', '/login', '/organisation']) {
      expect(appIdentity(pathname, null)).toEqual({ manifest: null, title: 'Mariam' });
    }
  });

  it('agrees with the dashboard manifests it links', () => {
    for (const app of DASHBOARD_APPS) {
      const manifest = JSON.parse(readFileSync(path.join(publicDir, app.manifest), 'utf8'));
      expect(manifest.name).toBe(app.name);
      expect(manifest.short_name).toBe(app.title);
      expect(manifest.id.startsWith(app.prefix)).toBe(true);
      expect(manifest.start_url).toBe(app.prefix);
    }
  });
});

describe('siteManifest', () => {
  it('opens the page of the site, under its name, within its organization', () => {
    expect(siteManifest('Restaurant des Sciences', 'crous', 'sciences')).toMatchObject({
      id: '/crous/sciences',
      start_url: '/crous/sciences',
      scope: '/crous/',
      name: 'Restaurant des Sciences',
      short_name: 'Restaurant des Sciences',
      display: 'standalone',
    });
  });
});
