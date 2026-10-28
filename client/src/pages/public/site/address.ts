import type { Site } from '@/lib/api/sites';

type Address = Pick<
  Site,
  'address_label' | 'address_postcode' | 'address_city' | 'address_lat' | 'address_lon'
>;

/** The BAN label ends with the postcode and the city, which take a line of their own. */
export function addressLines(site: Address): { street: string; locality: string } | null {
  const label = site.address_label?.trim();
  if (!label) return null;
  const locality = [site.address_postcode, site.address_city].filter(Boolean).join(' ');
  if (locality && label.endsWith(locality) && label.length > locality.length) {
    return { street: label.slice(0, -locality.length).replace(/[\s,]+$/, ''), locality };
  }
  return { street: label, locality: '' };
}

/** A universal link: it opens the device's own maps app. */
export function directionsUrl(site: Address): string | null {
  const destination =
    site.address_lat != null && site.address_lon != null
      ? `${site.address_lat},${site.address_lon}`
      : site.address_label;
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
