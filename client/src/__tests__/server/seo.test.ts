import { describe, it, expect } from 'vitest';
import { menuDescription, restaurantJsonLd } from '@/pages/public/seo/jsonld';
import { pageMeta } from '@/pages/public/seo/meta';
import type { DisplayCategory, RestaurantPublic } from '@/pages/public/menu-types';

function category(
  label: string,
  dishes: string[],
  subcategories: DisplayCategory[] = []
): DisplayCategory {
  return {
    id: label.length,
    label,
    is_highlighted: false,
    order: 0,
    items: dishes.map((name, id) => ({ id, dish: { id, name, tags: [], certifications: [] } })),
    subcategories,
  };
}

function day(categories: DisplayCategory[]) {
  return { date: '2026-10-15', menu: { date: '2026-10-15', by_category: categories } };
}

function site(fields: Partial<RestaurantPublic> = {}): RestaurantPublic {
  const base = {
    slug: 'alpha',
    name: 'Alpha',
    tagline: null,
    description: null,
    logo_url: null,
    cover_url: null,
    photos: [],
    address_label: null,
    address_city: null,
    address_postcode: null,
    access_info: null,
    quality_commitments: null,
    services: [],
    links: [],
    service_days: [],
    service_hours: {},
    vote_enabled: true,
    vote_icon_preset: 'thumbs',
    dietary_tags: [],
    certifications: [],
    menu_window: { from: '2026-09-15', to: '2026-10-22' },
    ...fields,
  } satisfies Omit<RestaurantPublic, 'config'>;
  const { service_days, dietary_tags, certifications } = base;
  return { ...base, config: { service_days, dietary_tags, certifications } };
}

const ORG = { name: 'Crous Démo', url: 'https://demo.test/' };

describe('pageMeta', () => {
  const base = { title: 'T', description: 'D', url: 'https://x.test/menu', siteName: 'S' };

  it('asks for a large preview only when there is an image', () => {
    expect(pageMeta(base)).toContainEqual({ name: 'twitter:card', content: 'summary' });
    expect(pageMeta(base).some((tag) => 'property' in tag && tag.property === 'og:image')).toBe(
      false
    );

    const withImage = pageMeta({ ...base, image: 'https://x.test/logo.png' });
    expect(withImage).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' });
    expect(withImage).toContainEqual({ property: 'og:image', content: 'https://x.test/logo.png' });
  });
});

describe('menuDescription', () => {
  it('names the first four dishes of the day, subcategories included', () => {
    const today = day([
      category('Entrées', ['Carottes râpées']),
      category(
        'Plats',
        [],
        [category('Viandes', ['Rôti']), category('Poissons', ['Colin', 'Sole'])]
      ),
      category('Desserts', ['Tarte']),
    ]);
    expect(menuDescription('Alpha', 'Demo', today)).toBe(
      'Menu du jour au Alpha : Carottes râpées, Rôti, Colin, Sole. Consultez le menu complet.'
    );
  });

  it('falls back to the site when there is no menu', () => {
    expect(menuDescription('Alpha', 'Demo', null)).toBe(
      'Consultez le menu du Alpha (Demo) : plats du jour, horaires et informations pratiques.'
    );
  });
});

describe('restaurantJsonLd', () => {
  const input = { url: 'https://demo.test/alpha', organization: ORG, multiSite: false };

  it('describes the restaurant and the menu of the day, one section per category', () => {
    const today = day([category('Plats', ['Curry'], [category('Poissons', ['Colin'])])]);
    const data = restaurantJsonLd({ ...input, site: site(), day: today });

    expect(data).toMatchObject({
      '@type': 'Restaurant',
      name: 'Alpha',
      url: 'https://demo.test/alpha',
      parentOrganization: { name: 'Crous Démo' },
      hasMenu: {
        name: 'Menu du 15/10/2026',
        hasMenuSection: [
          { name: 'Plats', hasMenuItem: [{ '@type': 'MenuItem', name: 'Curry' }] },
          { name: 'Poissons', hasMenuItem: [{ '@type': 'MenuItem', name: 'Colin' }] },
        ],
      },
    });
  });

  it('gives the address in parts, the hours, the services and the links', () => {
    const data = restaurantJsonLd({
      ...input,
      day: null,
      site: site({
        address_label: "1 place de l'Université 94000 Créteil",
        address_postcode: '94000',
        address_city: 'Créteil',
        address_lat: 48.79,
        address_lon: 2.45,
        service_days: [0, 1],
        service_hours: { '0': { open: '11:30', close: '14:00' } },
        services: ['wifi'],
        links: [{ kind: 'instagram', url: 'https://instagram.com/alpha', label: null }],
        cover_url: 'https://cdn.test/cover.jpg',
        photos: [{ url: 'https://cdn.test/1.jpg', alt: 'La salle', order: 0 }],
      }),
    });

    expect(data).toMatchObject({
      address: {
        '@type': 'PostalAddress',
        streetAddress: "1 place de l'Université",
        postalCode: '94000',
        addressLocality: 'Créteil',
      },
      geo: { latitude: 48.79, longitude: 2.45 },
      openingHoursSpecification: [
        { dayOfWeek: 'https://schema.org/Monday', opens: '11:30', closes: '14:00' },
      ],
      amenityFeature: [{ name: 'Wi-Fi', value: true }],
      sameAs: ['https://instagram.com/alpha'],
      image: ['https://cdn.test/cover.jpg', 'https://cdn.test/1.jpg'],
    });
  });

  it('claims no menu on a day without dishes', () => {
    const data = restaurantJsonLd({ ...input, site: site(), day: day([category('Plats', [])]) });
    expect(data).not.toHaveProperty('hasMenu');
    expect(data).not.toHaveProperty('image');
  });

  it('adds the trail to the organization when it has several sites', () => {
    const data = restaurantJsonLd({ ...input, multiSite: true, site: site(), day: null });

    expect(data).toMatchObject([
      { '@type': 'Restaurant' },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { position: 1, name: 'Crous Démo', item: 'https://demo.test/' },
          { position: 2, name: 'Alpha', item: 'https://demo.test/alpha' },
        ],
      },
    ]);
  });
});
