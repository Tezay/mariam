import type { SitePage } from '@/pages/public/menu-types';
import type { Menu } from './menus';
import type { Closure } from './closures';
import type { Event } from './events';
import type { Quality } from './quality';
import type { LiveStatus, PublicOrg, PublicSiteSummary, Site } from './sites';

type Env = Record<string, string | undefined>;

const TIMEOUT_MS = 5000;

// TLS ends at the proxy in front: this server only ever sees plain HTTP.
export function publicOrigin(request: Request): string {
  return `https://${new URL(request.url).host}`;
}

export function apiBaseUrl(request: Request, env: Env = process.env): string {
  const base = env.API_INTERNAL_URL || new URL(env.API_URL || '/v1', publicOrigin(request)).href;
  return base.replace(/\/+$/, '');
}

export function forwardedHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Without it the API would rate-limit every visitor as this one server.
  const visitor = request.headers.get('x-real-ip');
  if (visitor) headers['X-Real-IP'] = visitor;
  return headers;
}

async function getResponse(request: Request, path: string): Promise<Response | null> {
  const response = await fetch(`${apiBaseUrl(request)}${path}`, {
    headers: forwardedHeaders(request),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return response;
}

async function getJson<T>(request: Request, path: string): Promise<T | null> {
  const response = await getResponse(request, path);
  return response ? ((await response.json()) as T) : null;
}

const domains = new Map<string, { organization: PublicOrg; until: number }>();
const DOMAINS_KEPT = 500;

// Cached as long as the API allows: the answer changes rarely and every page needs it.
export async function fetchDomain(request: Request): Promise<PublicOrg | null> {
  const host = new URL(request.url).hostname;
  const cached = domains.get(host);
  if (cached && cached.until > Date.now()) return cached.organization;

  const response = await getResponse(request, `/domains/${encodeURIComponent(host)}`);
  if (!response) return null;
  const { organization } = (await response.json()) as { organization: PublicOrg };
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);
  if (maxAge > 0) {
    const oldest = domains.keys().next();
    if (domains.size >= DOMAINS_KEPT && !oldest.done) domains.delete(oldest.value);
    domains.set(host, { organization, until: Date.now() + maxAge * 1000 });
  }
  return organization;
}

export async function fetchSites(
  request: Request,
  org: string
): Promise<PublicSiteSummary[] | null> {
  const list = await getJson<{ items: PublicSiteSummary[] }>(
    request,
    `/orgs/${encodeURIComponent(org)}/sites`
  );
  return list?.items ?? null;
}

const sitePath = (org: string, slug: string) =>
  `/orgs/${encodeURIComponent(org)}/sites/${encodeURIComponent(slug)}`;

export async function fetchSitePage(
  request: Request,
  org: string,
  slug: string,
  from: string,
  to: string
): Promise<SitePage | null> {
  const path = sitePath(org, slug);
  const [site, menus, events, closures] = await Promise.all([
    getJson<Site>(request, path),
    getJson<{ items: Menu[] }>(request, `${path}/menus?from=${from}&to=${to}`),
    getJson<{ items: Event[] }>(request, `${path}/events?visibility=mobile`),
    getJson<{ items: Closure[] }>(request, `${path}/closures`),
  ]);
  if (!site) return null;
  return {
    site,
    menus: menus?.items ?? [],
    events: events?.items ?? [],
    closures: closures?.items ?? [],
  };
}

export async function fetchLiveStatus(
  request: Request,
  org: string,
  slug: string
): Promise<LiveStatus | null> {
  return getJson<LiveStatus>(request, `${sitePath(org, slug)}/live-status`);
}

export async function fetchQuality(
  request: Request,
  org: string,
  slug: string
): Promise<Quality | null> {
  return getJson<Quality>(request, `${sitePath(org, slug)}/quality`);
}
