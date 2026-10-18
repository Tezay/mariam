import { api, publicAxios, PUBLIC_API_TIMEOUT_MS, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type { SiteRef } from './client';

export type PublicOrg = Schemas['PublicOrg'];
export type PublicSiteSummary = Schemas['PublicSiteSummary'];
export type PublicSite = Schemas['PublicSite'];
export type PublicEvent = Schemas['PublicEvent'];
export type PublicClosure = Schemas['PublicClosure'];

const options = { timeout: PUBLIC_API_TIMEOUT_MS };

export const sitesApi = {
  get: async (org: string, site: string): Promise<PublicSite> =>
    (await publicAxios.get(sitePath({ org, site }), options)).data,

  events: async (org: string, site: string, visibility: 'mobile' | 'tv'): Promise<PublicEvent[]> =>
    (
      await publicAxios.get(`${sitePath({ org, site })}/events`, {
        ...options,
        params: { visibility },
      })
    ).data.items,

  /** The site as its editors read it, open or not. */
  getOwn: async (ref: SiteRef): Promise<PublicSite> => (await api.get(sitePath(ref))).data,

  closures: async (org: string, site: string): Promise<PublicClosure[]> =>
    (await publicAxios.get(`${sitePath({ org, site })}/closures`, options)).data.items,
};
