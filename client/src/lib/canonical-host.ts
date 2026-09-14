/**
 * Moves visitors off a retired hostname, service worker included.
 *
 * An edge redirect is not enough: the precached shell answers navigations
 * without touching the network, so the redirect never fires on a device that
 * already visited the old host. Only same-origin code can unregister that
 * worker, hence this runs before the app registers its own.
 */
const PLACEHOLDER = '__CANONICAL_HOST__';

export function canonicalTarget(currentHost: string, canonicalHost?: string): string | null {
  const target = canonicalHost?.trim();
  if (!target || target === PLACEHOLDER || target === currentHost) {
    return null;
  }
  return target;
}

async function clearOriginData(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
  } catch {
    // Redirecting matters more than a clean unregister.
  }
  try {
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).map((key) => caches.delete(key)));
  } catch {
    // Same.
  }
}

export async function migrateToCanonicalHost(): Promise<boolean> {
  const target = canonicalTarget(window.location.host, window.__RUNTIME_CONFIG__?.CANONICAL_HOST);
  if (!target) {
    return false;
  }
  await clearOriginData();
  const { pathname, search, hash } = window.location;
  window.location.replace(`${window.location.protocol}//${target}${pathname}${search}${hash}`);
  return true;
}
