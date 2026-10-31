import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type { SiteRef } from './client';

export type PublicOrg = Schemas['PublicOrg'];
export type PublicSiteSummary = Pick<Schemas['OrgSite'], 'slug' | 'name' | 'logo_url'>;
export type Site = Schemas['Site'];
export type SitePatch = Schemas['SitePatch'];
export type ServiceHours = Site['service_hours'];
export type PaymentMethod = NonNullable<Site['payment_methods']>[number];
export type VoteIconPreset = Site['vote_icon_preset'];
export type CalendarSettings = Schemas['CalendarSettings'];
export type CalendarSettingsPatch = Schemas['CalendarSettingsPatch'];
export type SitePhoto = Schemas['SitePhoto'];
export type LiveStatus = Schemas['LiveStatus'];

const UPLOAD = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 };

function upload(file: File, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('file', file);
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return form;
}

export const sitesApi = {
  get: async (org: string, site: string): Promise<Site> =>
    (await publicAxios.get(sitePath({ org, site }), { timeout: PUBLIC_API_TIMEOUT_MS })).data,

  /** The site as its editors read it, open or not, with the fields reserved to them. */
  getOwn: async (ref: SiteRef): Promise<Site> => (await api.get(sitePath(ref))).data,

  update: async (ref: SiteRef, patch: SitePatch): Promise<Site> =>
    (await api.patch(sitePath(ref), patch)).data,

  getLiveStatus: async (ref: SiteRef): Promise<LiveStatus> =>
    (await publicAxios.get(`${sitePath(ref)}/live-status`, { timeout: PUBLIC_API_TIMEOUT_MS }))
      .data,

  getOwnLiveStatus: async (ref: SiteRef): Promise<LiveStatus> =>
    (await api.get(`${sitePath(ref)}/live-status`)).data,

  setLiveStatus: async (ref: SiteRef, capacityReached: boolean): Promise<LiveStatus> =>
    (await api.put(`${sitePath(ref)}/live-status`, { capacity_reached: capacityReached })).data,

  getCalendarSettings: async (ref: SiteRef): Promise<CalendarSettings> =>
    (await api.get(`${sitePath(ref)}/calendar-settings`)).data,

  updateCalendarSettings: async (
    ref: SiteRef,
    patch: CalendarSettingsPatch
  ): Promise<CalendarSettings> =>
    (await api.patch(`${sitePath(ref)}/calendar-settings`, patch)).data,

  putMedia: async (ref: SiteRef, media: 'logo' | 'cover', file: File): Promise<Site> =>
    (await api.put(`${sitePath(ref)}/${media}`, upload(file), UPLOAD)).data,

  deleteMedia: async (ref: SiteRef, media: 'logo' | 'cover'): Promise<void> => {
    await api.delete(`${sitePath(ref)}/${media}`);
  },

  addPhoto: async (ref: SiteRef, file: File, alt: string): Promise<SitePhoto> =>
    (await api.post(`${sitePath(ref)}/photos`, upload(file, { alt }), UPLOAD)).data,

  updatePhoto: async (ref: SiteRef, id: number, alt: string): Promise<SitePhoto> =>
    (await api.patch(`${sitePath(ref)}/photos/${id}`, { alt })).data,

  deletePhoto: async (ref: SiteRef, id: number): Promise<void> => {
    await api.delete(`${sitePath(ref)}/photos/${id}`);
  },

  orderPhotos: async (ref: SiteRef, ids: number[]): Promise<SitePhoto[]> =>
    (await api.put(`${sitePath(ref)}/photos/order`, { photo_ids: ids })).data.items,
};
