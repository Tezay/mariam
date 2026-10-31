import {
  GlassWater,
  Laptop,
  Microwave,
  Plug,
  ShoppingBag,
  Umbrella,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { PaymentMethod, Site } from '@/lib/api/sites';

export type Service = Site['services'][number];
export type SiteLink = Site['links'][number];
export type LinkKind = SiteLink['kind'];

// Kept in step with PAYMENT_METHODS, SERVICES and LINK_KINDS (server/app/data/site_profile.py).
export const PAYMENT_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: 'izly', label: 'Izly' },
  { id: 'cb', label: 'Carte bancaire' },
  { id: 'cash', label: 'Espèces' },
  { id: 'ticket_restaurant', label: 'Ticket restaurant' },
];

export const SERVICES: { id: Service; label: string; icon: LucideIcon }[] = [
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'microwave', label: 'Micro-ondes', icon: Microwave },
  { id: 'takeaway', label: 'Vente à emporter', icon: ShoppingBag },
  { id: 'terrace', label: 'Terrasse', icon: Umbrella },
  { id: 'power_outlets', label: 'Prises électriques', icon: Plug },
  { id: 'water_fountain', label: 'Fontaine à eau', icon: GlassWater },
  { id: 'study_area', label: 'Espace de travail', icon: Laptop },
];

export const LINK_KINDS: { id: LinkKind; label: string; hosts: string[] | null }[] = [
  { id: 'website', label: 'Site web', hosts: null },
  { id: 'izly', label: 'Izly', hosts: ['izly.fr'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com'] },
  { id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com'] },
  { id: 'x', label: 'X', hosts: ['x.com', 'twitter.com'] },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
];

export const LINKS_MAX = 6;
export const PHOTOS_MAX = 8;
export const TEXT_MAX = {
  tagline: 160,
  description: 800,
  accessInfo: 300,
  qualityCommitments: 600,
  linkLabel: 40,
  alt: 150,
};
export const MENU_DAYS_MAX = { ahead: 28, back: 90 };
export const SERVICE_CAPACITY_MAX = 10_000;

export function linkKind(id: LinkKind) {
  return LINK_KINDS.find((kind) => kind.id === id) ?? LINK_KINDS[0];
}

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/** What the server would refuse in a link, said before it is sent; null when it holds. */
export function linkProblem(link: SiteLink): string | null {
  const url = parsedUrl(link.url);
  if (url?.protocol !== 'https:' || !url.hostname.includes('.')) {
    return 'Une adresse en https://, par exemple https://www.crous.fr.';
  }
  if (url.username || url.password) return "Une adresse sans nom d'utilisateur ni mot de passe.";
  const { hosts } = linkKind(link.kind);
  if (hosts === null) {
    return link.label?.trim() ? null : 'Nommez ce lien, par exemple « Site du Crous ».';
  }
  const host = url.hostname.toLowerCase();
  const allowed = hosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
  return allowed ? null : 'Cette adresse ne correspond pas au type de lien choisi.';
}
