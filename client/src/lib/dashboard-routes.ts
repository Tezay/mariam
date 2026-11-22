import type { Account, Role } from '@/lib/api/user';
import type { SiteRef } from '@/lib/api/sites';

export type Place = { kind: 'site'; org: string; site: string } | { kind: 'org'; org: string };

export const ACCOUNT_PATH = '/admin/account';
export const LANDING_PATH = '/admin';

const LAST_PLACE_KEY = 'mariam-last-place';

export function sitePath(ref: SiteRef, page = ''): string {
  return `/admin/${ref.org}/${ref.site}${page}`;
}

export function orgPath(org: string, page = ''): string {
  return `/org/${org}${page}`;
}

export function placePath(place: Place): string {
  return place.kind === 'site' ? sitePath(place) : orgPath(place.org);
}

export function placesOf(account: Account): Place[] {
  return [
    ...account.sites.map((s) => ({
      kind: 'site' as const,
      org: s.organization.slug,
      site: s.slug,
    })),
    ...account.organizations.map((o) => ({ kind: 'org' as const, org: o.slug })),
  ];
}

function samePlace(a: Place, b: Place): boolean {
  if (a.kind === 'site' && b.kind === 'site') return a.org === b.org && a.site === b.site;
  return a.kind === b.kind && a.org === b.org;
}

/** The account's role on a site it belongs to; none for a site it only supervises. */
export function siteRole(account: Account, ref: SiteRef): Role | null {
  return (
    account.sites.find((s) => s.organization.slug === ref.org && s.slug === ref.site)?.role ?? null
  );
}

export function supervises(account: Account, org: string): boolean {
  return account.organizations.some((o) => o.slug === org);
}

export function placeRole(account: Account, place: Place): Role | null {
  if (place.kind === 'site') return siteRole(account, place);
  return supervises(account, place.org) ? 'org_admin' : null;
}

/** Where the account lands: its last place if it still holds it, its only one, or the choice. */
export function landingPath(account: Account, last: Place | null): string | null {
  const places = placesOf(account);
  const kept = last && places.find((place) => samePlace(place, last));
  if (kept) return placePath(kept);
  return places.length === 1 ? placePath(places[0]) : null;
}

/** A path on this origin only: `//host`, `/\host` and absolute addresses lead elsewhere. */
export function safeNext(value: string | null): string | null {
  return value && /^\/(?![/\\])/.test(value) ? value : null;
}

export function readLastPlace(): Place | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_PLACE_KEY) ?? 'null');
    return value?.kind === 'site' || value?.kind === 'org' ? (value as Place) : null;
  } catch {
    return null;
  }
}

export function rememberPlace(place: Place): void {
  try {
    localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(place));
  } catch {
    // Without storage, the account lands on the choice of its places.
  }
}

/** Each dashboard installs its own app; an account with a site installs the site's. */
export function installPath(account: Account | null): string {
  return account?.sites.length || !account?.organizations.length
    ? '/admin/install'
    : '/org/install';
}

export interface PlaceGroup {
  organization: { slug: string; name: string };
  supervised: boolean;
  sites: { slug: string; name: string; role: Role }[];
}

export function placeGroups(account: Account): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  const group = (organization: { slug: string; name: string }) => {
    const found = groups.get(organization.slug);
    if (found) return found;
    const created = { organization, supervised: false, sites: [] };
    groups.set(organization.slug, created);
    return created;
  };
  for (const organization of account.organizations) group(organization).supervised = true;
  for (const { organization, slug, name, role } of account.sites) {
    group(organization).sites.push({ slug, name, role });
  }
  return [...groups.values()];
}

export function placeName(account: Account, place: Place): string {
  if (place.kind === 'org') {
    return account.organizations.find((o) => o.slug === place.org)?.name ?? '';
  }
  return (
    account.sites.find((s) => s.organization.slug === place.org && s.slug === place.site)?.name ??
    ''
  );
}
