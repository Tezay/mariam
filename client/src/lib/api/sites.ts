import { publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type PublicOrg = Schemas['PublicOrg'];
export type PublicSiteSummary = Schemas['PublicSiteSummary'];
export type PublicSite = Schemas['PublicSite'];
export type PublicMenu = Schemas['PublicMenu'];
export type PublicEvent = Schemas['PublicEvent'];
export type PublicClosure = Schemas['PublicClosure'];
export type Vote = Schemas['Vote'];
export type VoteState = Schemas['VoteState'];
export type VoteDishGroup = Schemas['DishGroup'];
export type VoteInput = Schemas['VoteInput'];

function sitePath(org: string, site: string): string {
  return `/orgs/${encodeURIComponent(org)}/sites/${encodeURIComponent(site)}`;
}

const options = { timeout: PUBLIC_API_TIMEOUT_MS };

export const sitesApi = {
  get: async (org: string, site: string): Promise<PublicSite> =>
    (await publicAxios.get(sitePath(org, site), options)).data,

  menus: async (org: string, site: string, from: string, to: string): Promise<PublicMenu[]> =>
    (await publicAxios.get(`${sitePath(org, site)}/menus`, { ...options, params: { from, to } }))
      .data.items,

  events: async (org: string, site: string, visibility: 'mobile' | 'tv'): Promise<PublicEvent[]> =>
    (await publicAxios.get(`${sitePath(org, site)}/events`, { ...options, params: { visibility } }))
      .data.items,

  closures: async (org: string, site: string): Promise<PublicClosure[]> =>
    (await publicAxios.get(`${sitePath(org, site)}/closures`, options)).data.items,

  getVote: async (org: string, site: string, date: string, deviceId: string): Promise<VoteState> =>
    (
      await publicAxios.get(`${sitePath(org, site)}/menus/${date}/vote`, {
        ...options,
        headers: { 'Device-Id': deviceId },
      })
    ).data,

  putVote: async (
    org: string,
    site: string,
    date: string,
    deviceId: string,
    vote: VoteInput
  ): Promise<Vote> =>
    (
      await publicAxios.put(`${sitePath(org, site)}/menus/${date}/vote`, vote, {
        ...options,
        headers: { 'Device-Id': deviceId },
      })
    ).data,
};
