import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { robotsTxt } from '@/pages/public/seo/robots';
import { stubLocalStorage } from '../session-fixtures';

const script = readFileSync(
  path.resolve(import.meta.dirname, '../../../public/theme-init.js'),
  'utf8'
);

function themeAt(
  pathname: string,
  { system, saved }: { system: 'dark' | 'light'; saved?: string }
) {
  window.history.pushState({}, '', pathname);
  window.matchMedia = ((query: string) => ({
    matches: system === 'dark' && query.includes('dark'),
    addEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  if (saved) localStorage.setItem('mariam-theme', saved);
  document.documentElement.classList.remove('dark');
  new Function(script)();
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

beforeEach(stubLocalStorage);

describe('theme-init.js', () => {
  it('follows the system on the public pages, whatever the dashboard saved', () => {
    expect(themeAt('/alpha', { system: 'dark', saved: 'light' })).toBe('dark');
    expect(themeAt('/privacy', { system: 'dark' })).toBe('dark');
    expect(themeAt('/', { system: 'light', saved: 'dark' })).toBe('light');
  });

  it('keeps the TV light', () => {
    expect(themeAt('/tv', { system: 'dark' })).toBe('light');
    expect(themeAt('/alpha/tv', { system: 'dark' })).toBe('light');
  });

  it("applies the dashboard's saved choice on every private page", () => {
    const privatePaths = [
      ...robotsTxt('https://x.test').matchAll(/^Disallow: (\/\w[\w-]*)$/gm),
    ].map((match) => match[1]);
    expect(privatePaths.length).toBeGreaterThan(3);
    for (const privatePath of privatePaths) {
      expect(themeAt(privatePath, { system: 'dark', saved: 'light' })).toBe('light');
      expect(themeAt(`${privatePath}/x`, { system: 'light', saved: 'dark' })).toBe('dark');
    }
  });
});
