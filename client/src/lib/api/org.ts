import { api, orgPath, type OrgRef } from './client';
import type { CatalogPeriod } from './dishes';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

/** Required: the supervisors' fields, absent for anyone else, always come for them. */
export type OrgSite = Required<Schemas['OrgSite']>;
export type OrgCatalogDish = Schemas['OrgDishGroupSummary'];
export type OrgCatalogPage = Schemas['OrgDishGroupList'];
export type OrgCatalogSort = 'usage' | 'sites' | 'name' | 'photos' | 'score';
export type OrgCatalogGroup = Schemas['OrgDishGroup'];

export const orgApi = {
  getSites: async (ref: OrgRef): Promise<OrgSite[]> =>
    (await api.get(`${orgPath(ref)}/sites`)).data.items,

  getCatalog: async (
    ref: OrgRef,
    params: {
      q?: string;
      sort?: OrgCatalogSort;
      order?: 'asc' | 'desc';
      period?: CatalogPeriod;
      page?: number;
      per_page?: number;
    }
  ): Promise<OrgCatalogPage> => (await api.get(`${orgPath(ref)}/dish-groups`, { params })).data,

  getCatalogGroup: async (ref: OrgRef, normalizedName: string): Promise<OrgCatalogGroup> =>
    (await api.get(`${orgPath(ref)}/dish-groups/${encodeURIComponent(normalizedName)}`)).data,
};
