import { isDashboardPath } from './dashboard-paths';

type Env = Record<string, string | undefined>;

export interface Hosts {
  dashboard: URL | null;
  public: URL | null;
  legacy: Set<string>;
}

type SiteSlug = { slug: string };

// Answered on every host: the pages that load them stay where they are.
const SHARED_FILES = new Set(['config.js', 'robots.txt', 'sitemap.xml', 'app.webmanifest']);

function urlOf(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  return trimmed ? new URL(trimmed) : null;
}

export function hostsOf(env: Env = process.env): Hosts {
  const hosts = {
    dashboard: urlOf(env.DASHBOARD_URL),
    public: urlOf(env.PUBLIC_URL),
    legacy: new Set(
      (env.LEGACY_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    ),
  };
  // A former host would redirect to itself.
  if (hosts.legacy.size > 0 && !hosts.public) throw new Error('LEGACY_HOSTS needs PUBLIC_URL');
  return hosts;
}

export function isDashboardHost(url: URL, hosts: Hosts): boolean {
  return Boolean(hosts.dashboard && hosts.public && url.host === hosts.dashboard.host);
}

export function hostRedirect(url: URL, hosts: Hosts): string | null {
  if (!hosts.dashboard || !hosts.public) return null;
  const dashboard = isDashboardPath(url.pathname);
  if (url.host === hosts.public.host) {
    return dashboard ? `${hosts.dashboard.origin}${url.pathname}${url.search}` : null;
  }
  if (url.host !== hosts.dashboard.host || dashboard) return null;
  if (url.pathname === '/') return '/admin';
  if (SHARED_FILES.has(url.pathname.slice(1))) return null;
  return `${hosts.public.origin}${url.pathname}${url.search}`;
}

export function legacyOrg(url: URL, hosts: Hosts): string | null {
  return hosts.legacy.has(url.hostname) ? url.hostname.split('.')[0] : null;
}

const segmentsOf = (url: URL) => url.pathname.split('/').filter(Boolean);

export function legacyNeedsSites(url: URL): boolean {
  const [first, ...rest] = segmentsOf(url);
  return rest.length === 0 && (!first || first === 'menu' || first === 'tv');
}

export function legacyTarget(
  url: URL,
  org: string,
  sites: SiteSlug[] | null,
  hosts: Hosts
): string {
  const origin = hosts.public!.origin;
  const segments = segmentsOf(url);
  const [first = '', second] = segments;
  const query = new URLSearchParams(url.search);
  const tv = query.get('mode') === 'tv';
  query.delete('mode');
  const kept = query.toString();
  const search = kept ? `?${kept}` : '';

  const sitePage = (site: string, onTv: boolean) =>
    `${origin}/${org}/${site}${onTv ? '/tv' : ''}${search}`;
  const home = (onTv: boolean) =>
    sites?.length === 1 ? sitePage(sites[0].slug, onTv) : `${origin}/${org}`;

  if (isDashboardPath(url.pathname)) {
    return `${(hosts.dashboard ?? hosts.public)!.origin}${url.pathname}${url.search}`;
  }
  if (segments.length === 0 || (segments.length === 1 && first === 'menu')) return home(tv);
  if (segments.length === 1 && first === 'tv') return home(true);
  if (segments.length === 1 && first === 'privacy') return `${origin}/privacy`;
  if (segments.length === 1 && (first === 'robots.txt' || first === 'sitemap.xml')) {
    return `${origin}/${first}`;
  }
  if (segments.length === 1 || (segments.length === 2 && second === 'menu')) {
    return sitePage(first, tv);
  }
  if (segments.length === 2 && second === 'tv') return sitePage(first, true);
  return `${origin}/${org}`;
}
