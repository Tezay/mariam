import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type { SiteRef } from './client';

export type PublicOrg = Schemas['PublicOrg'];
export type PublicSiteSummary = Schemas['PublicSiteSummary'];
export type Site = Schemas['Site'];
export type SitePatch = Schemas['SitePatch'];
export type ServiceHours = Site['service_hours'];
export type PaymentMethod = NonNullable<Site['payment_methods']>[number];
export type VoteIconPreset = Site['vote_icon_preset'];
export type CalendarSettings = Schemas['CalendarSettings'];
export type CalendarSettingsPatch = Schemas['CalendarSettingsPatch'];

export const sitesApi = {
  get: async (org: string, site: string): Promise<Site> =>
    (await publicAxios.get(sitePath({ org, site }), { timeout: PUBLIC_API_TIMEOUT_MS })).data,

  /** The site as its editors read it, open or not, with the fields reserved to them. */
  getOwn: async (ref: SiteRef): Promise<Site> => (await api.get(sitePath(ref))).data,

  update: async (ref: SiteRef, patch: SitePatch): Promise<Site> =>
    (await api.patch(sitePath(ref), patch)).data,

  getCalendarSettings: async (ref: SiteRef): Promise<CalendarSettings> =>
    (await api.get(`${sitePath(ref)}/calendar-settings`)).data,

  updateCalendarSettings: async (
    ref: SiteRef,
    patch: CalendarSettingsPatch
  ): Promise<CalendarSettings> =>
    (await api.patch(`${sitePath(ref)}/calendar-settings`, patch)).data,
};
