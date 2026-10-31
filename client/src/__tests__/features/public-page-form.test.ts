import { describe, it, expect } from 'vitest';
import { patchOf, type PublicPageForm } from '@/pages/admin/public-page/public-page-form';

const SAVED: PublicPageForm = {
  tagline: 'Cuisine préparée sur place',
  description: '',
  accessInfo: '',
  qualityCommitments: '',
  services: ['wifi', 'terrace'],
  links: [{ kind: 'izly', url: 'https://mon-espace.izly.fr', label: null }],
  menuDaysAhead: 7,
  menuDaysBack: 30,
};

describe('patchOf', () => {
  it('sends nothing when nothing changed', () => {
    expect(patchOf({ ...SAVED, services: ['terrace', 'wifi'] }, SAVED)).toEqual({});
  });

  it('sends the changed fields only, as the API names them', () => {
    const form = { ...SAVED, accessInfo: 'Métro 8.', menuDaysAhead: 0 };

    expect(patchOf(form, SAVED)).toEqual({ access_info: 'Métro 8.', menu_days_ahead: 0 });
  });

  it('sends every link once one changes, trimmed, with a label for a website only', () => {
    const form = {
      ...SAVED,
      links: [
        ...SAVED.links,
        { kind: 'website' as const, url: ' https://www.crous-demo.fr ', label: 'Site du Crous' },
      ],
    };

    expect(patchOf(form, SAVED).links).toEqual([
      { kind: 'izly', url: 'https://mon-espace.izly.fr', label: null },
      { kind: 'website', url: 'https://www.crous-demo.fr', label: 'Site du Crous' },
    ]);
  });
});
