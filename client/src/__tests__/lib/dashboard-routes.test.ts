import { describe, expect, it } from 'vitest';
import type { Account } from '@/lib/api/user';
import { landingPath, placeGroups, placeName, placeRole, safeNext } from '@/lib/dashboard-routes';

const crous = { slug: 'crous', name: 'Crous' };
const other = { slug: 'autre', name: 'Autre' };

function account(sites: Account['sites'], organizations: Account['organizations'] = []): Account {
  return { sites, organizations } as Account;
}

const two = account(
  [
    { slug: 'nord', name: 'Nord', role: 'admin', organization: crous },
    { slug: 'sud', name: 'Sud', role: 'editor', organization: other },
  ],
  [crous]
);

describe('landingPath', () => {
  it('opens the last place while the account still holds it', () => {
    expect(landingPath(two, { kind: 'site', org: 'autre', site: 'sud' })).toBe('/admin/autre/sud');
    expect(landingPath(two, { kind: 'org', org: 'crous' })).toBe('/org/crous');
  });

  it('offers the choice once the last place is gone', () => {
    expect(landingPath(two, { kind: 'site', org: 'crous', site: 'ouest' })).toBeNull();
    expect(landingPath(two, null)).toBeNull();
  });

  it('opens the only place', () => {
    const one = account([{ slug: 'nord', name: 'Nord', role: 'editor', organization: crous }]);
    expect(landingPath(one, null)).toBe('/admin/crous/nord');
  });

  it('offers the choice to an account without any place', () => {
    expect(landingPath(account([]), null)).toBeNull();
  });
});

describe('safeNext', () => {
  it('keeps a path of this origin', () => {
    expect(safeNext('/activate/abc')).toBe('/activate/abc');
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', 'evil', '', null])(
    'refuses %s',
    (value) => {
      expect(safeNext(value)).toBeNull();
    }
  );
});

describe('placeGroups and placeRole', () => {
  it('groups the sites by organization, with its supervision', () => {
    expect(placeGroups(two)).toEqual([
      {
        organization: crous,
        supervised: true,
        sites: [{ slug: 'nord', name: 'Nord', role: 'admin' }],
      },
      {
        organization: other,
        supervised: false,
        sites: [{ slug: 'sud', name: 'Sud', role: 'editor' }],
      },
    ]);
  });

  it('gives the role on a site, and none on a site it does not belong to', () => {
    expect(placeRole(two, { kind: 'site', org: 'autre', site: 'sud' })).toBe('editor');
    expect(placeRole(two, { kind: 'site', org: 'crous', site: 'ouest' })).toBeNull();
    expect(placeRole(two, { kind: 'org', org: 'autre' })).toBeNull();
  });
});

describe('placeName', () => {
  it('names a site and a supervised organization', () => {
    expect(placeName(two, { kind: 'site', org: 'autre', site: 'sud' })).toBe('Sud');
    expect(placeName(two, { kind: 'org', org: 'crous' })).toBe('Crous');
  });
});
