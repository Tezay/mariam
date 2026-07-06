/**
 * Constantes et helpers partagés entre les onglets de la page Paramètres.
 */
import { ServiceHours } from '@/lib/api';

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const PAYMENT_OPTIONS: { id: string; label: string }[] = [
    { id: 'izly', label: 'Izly' },
    { id: 'cb', label: 'Carte bancaire' },
    { id: 'cash', label: 'Espèces' },
    { id: 'ticket_restaurant', label: 'Ticket restaurant' },
];

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

/** Champs du restaurant participant au dirty tracking (onglets Infos, Horaires, Accessibilité, Tags). */
export interface RestaurantFormState {
    name: string;
    serviceDays: number[];
    serviceHours: ServiceHours;
    enabledTags: string[];
    enabledCerts: string[];
    addressLabel: string;
    addressLat: number | null;
    addressLon: number | null;
    email: string;
    phone: string;
    capacity: string;
    paymentMethods: string[];
    pmrAccess: boolean | null;
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
        email: s.email,
        phone: s.phone,
        capacity: s.capacity,
        paymentMethods: s.paymentMethods,
        pmrAccess: s.pmrAccess,
    });
}
