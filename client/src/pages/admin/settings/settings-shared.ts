import type { PaymentMethod, ServiceHours, VoteIconPreset } from '@/lib/api/sites';
import { parseSiteName, SITE_NAME_RULE } from '@/lib/site-name';

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function validateSiteName(val: string): string | null {
  return parseSiteName(val) === null ? SITE_NAME_RULE : null;
}

export function validateEmail(val: string): string | null {
  if (!val) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Adresse email invalide';
}

export function validatePhone(val: string): string | null {
  if (!val) return null;
  const digits = val.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Numéro invalide (7 à 15 chiffres)';
  if (!/^\+?[\d\s\-().]+$/.test(val)) return 'Format invalide';
  return null;
}

export interface RestaurantFormState {
  name: string;
  serviceDays: number[];
  serviceHours: ServiceHours;
  enabledTags: string[];
  enabledCerts: string[];
  addressLabel: string;
  addressLat: number | null;
  addressLon: number | null;
  addressCity: string | null;
  addressPostcode: string | null;
  email: string;
  phone: string;
  serviceCapacity: string;
  paymentMethods: PaymentMethod[];
  pmrAccess: boolean | null;
  voteEnabled: boolean;
  voteCategoryIds: number[];
  voteIconPreset: VoteIconPreset;
}

export function serializeRestaurantState(s: RestaurantFormState): string {
  return JSON.stringify({
    name: s.name,
    serviceDays: s.serviceDays,
    serviceHours: s.serviceHours,
    enabledTags: s.enabledTags,
    enabledCerts: s.enabledCerts,
    addressLabel: s.addressLabel,
    addressLat: s.addressLat,
    addressLon: s.addressLon,
    addressCity: s.addressCity,
    addressPostcode: s.addressPostcode,
    email: s.email,
    phone: s.phone,
    serviceCapacity: s.serviceCapacity,
    paymentMethods: s.paymentMethods,
    pmrAccess: s.pmrAccess,
    voteEnabled: s.voteEnabled,
    voteCategoryIds: [...s.voteCategoryIds].sort((a, b) => a - b),
    voteIconPreset: s.voteIconPreset,
  });
}
