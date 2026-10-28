import { SERVICES } from '@/lib/site-profile';
import { addressLines } from '../site/address';
import type { DisplayCategory, MenuData, RestaurantPublic } from '../menu-types';

type Day = Pick<MenuData, 'date' | 'menu'>;

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

export function menuDescription(siteName: string, orgName: string, day: Day | null) {
  const dishes = sections(day?.menu?.by_category ?? [])
    .flatMap((section) => section.dishes)
    .slice(0, 4);
  if (dishes.length > 0) {
    return `Menu du jour au ${siteName} : ${dishes.join(', ')}. Consultez le menu complet.`;
  }
  return `Consultez le menu du ${siteName} (${orgName}) : plats du jour, horaires et informations pratiques.`;
}

const SCHEMA_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
].map((day) => `https://schema.org/${day}`);

function openingHours(site: RestaurantPublic) {
  return site.service_days
    .filter((day) => site.service_hours[String(day)])
    .map((day) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAYS[day],
      opens: site.service_hours[String(day)].open,
      closes: site.service_hours[String(day)].close,
    }));
}

interface JsonLdInput {
  site: RestaurantPublic;
  url: string;
  organization: { name: string; url: string };
  multiSite: boolean;
  day: Day | null;
}

export function restaurantJsonLd({
  site,
  url,
  organization,
  multiSite,
  day,
}: JsonLdInput): Record<string, unknown> | Record<string, unknown>[] {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: site.name,
    url,
    servesCuisine: 'Restauration universitaire',
    parentOrganization: { '@type': 'Organization', name: organization.name },
  };
  if (site.tagline) data.description = site.tagline;
  const images = [site.cover_url, ...site.photos.map((photo) => photo.url)].filter(Boolean);
  if (images.length > 0) data.image = images;
  if (site.logo_url) data.logo = site.logo_url;
  if (site.phone) data.telephone = site.phone;
  if (site.email) data.email = site.email;

  const address = addressLines(site);
  if (address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: address.street,
      ...(site.address_postcode && { postalCode: site.address_postcode }),
      ...(site.address_city && { addressLocality: site.address_city }),
      addressCountry: 'FR',
    };
  }
  if (site.address_lat != null && site.address_lon != null) {
    data.geo = {
      '@type': 'GeoCoordinates',
      latitude: site.address_lat,
      longitude: site.address_lon,
    };
  }
  const hours = openingHours(site);
  if (hours.length > 0) data.openingHoursSpecification = hours;
  const services = SERVICES.filter((service) => site.services.includes(service.id));
  if (services.length > 0) {
    data.amenityFeature = services.map((service) => ({
      '@type': 'LocationFeatureSpecification',
      name: service.label,
      value: true,
    }));
  }
  if (site.links.length > 0) data.sameAs = site.links.map((link) => link.url);

  const menuSections = sections(day?.menu?.by_category ?? []);
  if (day?.menu && menuSections.length > 0) {
    data.hasMenu = {
      '@type': 'Menu',
      name: `Menu du ${frenchDate(day.date)}`,
      hasMenuSection: menuSections.map((section) => ({
        '@type': 'MenuSection',
        name: section.name,
        hasMenuItem: section.dishes.map((name) => ({ '@type': 'MenuItem', name })),
      })),
    };
  }
  if (!multiSite) return data;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: organization.name, item: organization.url },
      { '@type': 'ListItem', position: 2, name: site.name, item: url },
    ],
  };
  return [data, breadcrumb];
}
