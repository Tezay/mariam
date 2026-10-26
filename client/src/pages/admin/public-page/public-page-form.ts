import type { Site, SitePatch } from '@/lib/api/sites';
import type { Service, SiteLink } from '@/lib/site-profile';

/** What the save bar writes; images are stored as soon as they are sent. */
export interface PublicPageForm {
  tagline: string;
  description: string;
  accessInfo: string;
  services: Service[];
  links: SiteLink[];
  menuDaysAhead: number;
  menuDaysBack: number;
}

export function formOf(site: Site): PublicPageForm {
  return {
    tagline: site.tagline ?? '',
    description: site.description ?? '',
    accessInfo: site.access_info ?? '',
    services: site.services,
    links: site.links,
    menuDaysAhead: site.menu_days_ahead ?? 7,
    menuDaysBack: site.menu_days_back ?? 30,
  };
}

function sameServices(a: Service[], b: Service[]): boolean {
  return a.length === b.length && a.every((service) => b.includes(service));
}

function linkInput(link: SiteLink): SiteLink {
  return {
    kind: link.kind,
    url: link.url.trim(),
    label: link.kind === 'website' ? (link.label ?? '') : null,
  };
}

export function patchOf(form: PublicPageForm, saved: PublicPageForm): SitePatch {
  const patch: SitePatch = {};
  if (form.tagline !== saved.tagline) patch.tagline = form.tagline;
  if (form.description !== saved.description) patch.description = form.description;
  if (form.accessInfo !== saved.accessInfo) patch.access_info = form.accessInfo;
  if (!sameServices(form.services, saved.services)) patch.services = form.services;
  if (JSON.stringify(form.links.map(linkInput)) !== JSON.stringify(saved.links.map(linkInput))) {
    patch.links = form.links.map(linkInput);
  }
  if (form.menuDaysAhead !== saved.menuDaysAhead) patch.menu_days_ahead = form.menuDaysAhead;
  if (form.menuDaysBack !== saved.menuDaysBack) patch.menu_days_back = form.menuDaysBack;
  return patch;
}
