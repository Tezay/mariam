/**
 * Anonymous page counting for the public pages.
 *
 * Fire-and-forget by design: a menu must render whether or not the counter is
 * reachable, so nothing here is awaited and every failure is swallowed.
 */
import { API_URL } from './runtime-config';

export type PageKind = 'today' | 'tomorrow' | 'day' | 'tv' | 'sites';

// One count per kind and loaded page: a refresh is a new visit, going from day to
// day within the same page is not.
const sent = new Set<string>();

export function trackPageView(pageKind: PageKind, org: string, site?: string): void {
  const key = `${pageKind}:${org}:${site ?? ''}`;
  if (sent.has(key)) return;
  sent.add(key);

  const url = `${API_URL}/orgs/${encodeURIComponent(org)}/page-views`;
  const payload = JSON.stringify({ page_kind: pageKind, site });
  try {
    // sendBeacon survives the page being closed and skips the CORS preflight.
    if (navigator.sendBeacon?.(url, new Blob([payload], { type: 'text/plain' }))) {
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* counting must never disturb a visitor */
  }
}
