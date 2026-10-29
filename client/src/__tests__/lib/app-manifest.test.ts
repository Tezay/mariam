import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appIdentity, DASHBOARD_APPS, siteManifest } from '@/lib/app-manifest';

const publicDir = path.resolve(import.meta.dirname, '../../../public');
const SITE = { slug: 'sciences', name: 'Restaurant des Sciences' };

describe('appIdentity', () => {
  it('names the app of each context', () => {
    expect(appIdentity('/admin/calendar', SITE).manifest).toBe('/manifest-admin.webmanifest');
    expect(appIdentity('/admin', null).title).toBe('Gestion');
    expect(appIdentity('/org/sites/sciences', null).manifest).toBe('/manifest-org.webmanifest');
    expect(appIdentity('/sciences', SITE)).toEqual({
      manifest: '/app.webmanifest?site=sciences',
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
      expect(manifest.id).toBe(manifest.start_url);
      expect(manifest.start_url.startsWith(app.prefix)).toBe(true);
    }
  });
});

describe('siteManifest', () => {
  it('opens the page of the site, under its name, as one app per page', () => {
    expect(siteManifest('Restaurant des Sciences', '/sciences')).toMatchObject({
      id: '/sciences',
      start_url: '/sciences',
      scope: '/',
      name: 'Restaurant des Sciences',
      short_name: 'Restaurant des Sciences',
      display: 'standalone',
    });
    expect(siteManifest('Solo', '/')).toMatchObject({ id: '/', start_url: '/' });
  });
});
