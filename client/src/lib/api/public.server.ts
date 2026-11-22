import type { SitePage } from '@/pages/public/menu-types';
import type { Menu } from './menus';
import type { Closure } from './closures';
import type { News } from './news';
import type { Quality } from './quality';
import type { LiveStatus, PublicOrg, PublicSiteSummary, Site } from './sites';
import { hostsOf } from '../hosts.server';

type Env = Record<string, string | undefined>;

const TIMEOUT_MS = 5000;

// TLS ends at the proxy in front: this server only ever sees plain HTTP.
function requestOrigin(request: Request): string {
  return `https://${new URL(request.url).host}`;
}

export function publicOrigin(request: Request, env: Env = process.env): string {
  return hostsOf(env).public?.origin ?? requestOrigin(request);
}

export function apiBaseUrl(request: Request, env: Env = process.env): string {
  const base = env.API_INTERNAL_URL || new URL(env.API_URL || '/v1', requestOrigin(request)).href;
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

export async function fetchOrgs(request: Request): Promise<PublicOrg[]> {
  const list = await getJson<{ items: PublicOrg[] }>(request, '/orgs');
  return list?.items ?? [];
}

export async function fetchOrg(request: Request, org: string): Promise<PublicOrg | null> {
  return getJson<PublicOrg>(request, `/orgs/${encodeURIComponent(org)}`);
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
  to: string,
  newsQuery = 'visibility=mobile'
): Promise<SitePage | null> {
  const path = sitePath(org, slug);
  const [site, menus, news, closures] = await Promise.all([
    getJson<Site>(request, path),
    getJson<{ items: Menu[] }>(request, `${path}/menus?from=${from}&to=${to}`),
    getJson<{ items: News[] }>(request, `${path}/news?${newsQuery}`),
    getJson<{ items: Closure[] }>(request, `${path}/closures`),
  ]);
  if (!site) return null;
  return {
    site,
    menus: menus?.items ?? [],
    news: news?.items ?? [],
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
