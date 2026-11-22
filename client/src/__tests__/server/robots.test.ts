import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '@/routes/robots';

const robotsOn = (host: string) =>
  loader({ request: new Request(`http://${host}/robots.txt`) } as never).text();

describe('robots.txt', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('closes the dashboard host, and points the public one to its sitemap', async () => {
    vi.stubEnv('DASHBOARD_URL', 'https://app.example.test');
    vi.stubEnv('PUBLIC_URL', 'https://example.test');

    expect(await robotsOn('app.example.test')).toBe('User-agent: *\nDisallow: /\n');
    expect(await robotsOn('example.test')).toContain('Sitemap: https://example.test/sitemap.xml');
  });
});
