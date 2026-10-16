import type { DisplayCategory, MenuData, RestaurantPublic } from '../menu-types';

interface MenuSection {
  name: string;
  dishes: string[];
}

function sections(categories: DisplayCategory[]): MenuSection[] {
  return categories.flatMap((category) => {
    const dishes = (category.items ?? []).flatMap((item) => (item.dish ? [item.dish.name] : []));
    const own = dishes.length > 0 ? [{ name: category.label, dishes }] : [];
    return [...own, ...sections(category.subcategories ?? [])];
  });
}

function frenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function menuDescription(siteName: string, orgName: string, today: MenuData | null) {
  const dishes = sections(today?.menu?.by_category ?? [])
    .flatMap((section) => section.dishes)
    .slice(0, 4);
  if (dishes.length > 0) {
    return `Menu du jour au ${siteName} : ${dishes.join(', ')}. Consultez le menu complet.`;
  }
  return `Consultez le menu du ${siteName} (${orgName}) : plats du jour, horaires et informations pratiques.`;
}

export function restaurantJsonLd(
  siteName: string,
  url: string,
  restaurant: RestaurantPublic | null,
  today: MenuData | null
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: siteName,
    url,
    servesCuisine: 'Restauration universitaire',
  };
  if (restaurant?.logo_url) data.image = restaurant.logo_url;
  if (restaurant?.address_label) data.address = restaurant.address_label;
  if (restaurant?.phone) data.telephone = restaurant.phone;

  const menuSections = sections(today?.menu?.by_category ?? []);
  if (today?.menu && menuSections.length > 0) {
    data.hasMenu = {
      '@type': 'Menu',
      name: `Menu du ${frenchDate(today.date)}`,
      hasMenuSection: menuSections.map((section) => ({
        '@type': 'MenuSection',
        name: section.name,
        hasMenuItem: section.dishes.map((name) => ({ '@type': 'MenuItem', name })),
      })),
    };
  }
  return data;
}
