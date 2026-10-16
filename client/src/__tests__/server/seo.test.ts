import { describe, it, expect } from 'vitest';
import { menuDescription, restaurantJsonLd } from '@/pages/public/seo/jsonld';
import { pageMeta } from '@/pages/public/seo/meta';
import type { DisplayCategory, MenuData, RestaurantPublic } from '@/pages/public/menu-types';

function category(label: string, dishes: string[], subcategories: DisplayCategory[] = []) {
  return {
    id: label.length,
    label,
    icon: 'utensils',
    is_highlighted: false,
    is_protected: false,
    order: 0,
    items: dishes.map((name, id) => ({ id, dish: { id, name } })),
    subcategories,
  } as DisplayCategory;
}

function day(categories: DisplayCategory[]): MenuData {
  return {
    date: '2026-10-15',
    day_name: 'Jeudi',
    menu: { date: '2026-10-15', items: [], by_category: categories },
  };
}

const restaurant = {
  id: 1,
  name: 'Alpha',
  logo_url: 'https://cdn.example.test/alpha.png',
  address_label: '1 rue de la Paix, 75001 Paris',
  phone: '01 23 45 67 89',
  service_hours: {},
} as RestaurantPublic;

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
  it('describes the restaurant and the menu of the day, one section per category', () => {
    const today = day([category('Plats', ['Curry'], [category('Poissons', ['Colin'])])]);
    const data = restaurantJsonLd('Alpha', 'https://x.test/alpha/menu', restaurant, today);

    expect(data).toMatchObject({
      '@type': 'Restaurant',
      name: 'Alpha',
      url: 'https://x.test/alpha/menu',
      image: restaurant.logo_url,
      address: restaurant.address_label,
      telephone: restaurant.phone,
      hasMenu: {
        name: 'Menu du 15/10/2026',
        hasMenuSection: [
          { name: 'Plats', hasMenuItem: [{ '@type': 'MenuItem', name: 'Curry' }] },
          { name: 'Poissons', hasMenuItem: [{ '@type': 'MenuItem', name: 'Colin' }] },
        ],
      },
    });
  });

  it('claims no menu on a day without dishes', () => {
    const data = restaurantJsonLd(
      'Alpha',
      'https://x.test/menu',
      null,
      day([category('Plats', [])])
    );
    expect(data).not.toHaveProperty('hasMenu');
    expect(data).not.toHaveProperty('image');
  });
});
