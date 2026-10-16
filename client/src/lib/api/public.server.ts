import type { ExceptionalClosure } from './closures';
import type { PublicOrg } from './public';
import type {
  EventData,
  MenuData,
  PublicMenuData,
  RestaurantPublic,
} from '@/pages/public/menu-types';

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
  // The API resolves the tenant from Origin when it answers on a host of its own.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Origin: publicOrigin(request),
  };
  // Without it the API would rate-limit every visitor as this one server.
  const visitor = request.headers.get('x-real-ip');
  if (visitor) headers['X-Real-IP'] = visitor;
  return headers;
}

async function getJson<T>(request: Request, path: string): Promise<T | null> {
  const response = await fetch(`${apiBaseUrl(request)}${path}`, {
    headers: forwardedHeaders(request),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export function fetchPublicOrg(request: Request): Promise<PublicOrg | null> {
  return getJson<PublicOrg>(request, '/public/org');
}

export async function fetchPublicMenu(request: Request, slug: string): Promise<PublicMenuData> {
  const site = `/public/${encodeURIComponent(slug)}`;
  const [today, tomorrow, events, closures, restaurant] = await Promise.all([
    getJson<MenuData>(request, `${site}/today`),
    getJson<MenuData>(request, `${site}/tomorrow`),
    getJson<{ today_event: EventData | null; upcoming_events: EventData[] }>(
      request,
      `${site}/events?visibility=mobile`
    ),
    getJson<{
      current_closure: ExceptionalClosure | null;
      upcoming_closures: ExceptionalClosure[];
    }>(request, `${site}/closures`),
    getJson<{ restaurant: RestaurantPublic }>(request, `${site}/restaurant`),
  ]);
  return {
    today,
    tomorrow,
    todayEvent: events?.today_event ?? null,
    upcomingEvents: events?.upcoming_events ?? [],
    activeClosure: closures?.current_closure ?? null,
    upcomingClosures: closures?.upcoming_closures ?? [],
    restaurant: restaurant?.restaurant ?? null,
  };
}
