import type { PublicOrg } from './public';

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
  const visitor =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (visitor) headers['X-Forwarded-For'] = visitor;
  return headers;
}

export async function fetchPublicOrg(request: Request): Promise<PublicOrg | null> {
  const response = await fetch(`${apiBaseUrl(request)}/public/org`, {
    headers: forwardedHeaders(request),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /public/org answered ${response.status}`);
  return (await response.json()) as PublicOrg;
}
