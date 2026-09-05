/**
 * Anonymous page counting for the public pages.
 *
 * Fire-and-forget by design: a menu must render whether or not the counter is
 * reachable, so nothing here is awaited and every failure is swallowed.
 */
import { API_URL } from './api';

const TRACK_URL = `${API_URL}/public/track`;

export type PageKind = 'today' | 'tomorrow' | 'tv' | 'sites';

// One count per rendered page: a refresh is a new visit, switching to "demain"
// within the same page is not.
const sent = new Set<string>();

export function trackPageView(pageKind: PageKind, site?: string): void {
  const key = `${pageKind}:${site ?? ''}`;
  if (sent.has(key)) return;
  sent.add(key);

  const payload = JSON.stringify({ page_kind: pageKind, site });
  try {
    // sendBeacon survives the page being closed and skips the CORS preflight.
    if (navigator.sendBeacon?.(TRACK_URL, new Blob([payload], { type: 'text/plain' }))) {
      return;
    }
    void fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* counting must never disturb a visitor */
  }
}
