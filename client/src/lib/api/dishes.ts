import { api, sitePath, type SiteRef } from './client';
import type { components } from './schema.gen';

type Schemas = components['schemas'];

export type Dish = Schemas['Dish'];
export type DishStats = Schemas['DishStats'];
export type DishSatisfaction = Schemas['Satisfaction'];
export type DishBatchDeleteResult = Schemas['DishBatchDeleteResult'];
export type DishBatchUpdateResult = Schemas['DishBatchUpdateResult'];
export type DishInput = Schemas['DishInput'];
export type DishPatch = Schemas['DishPatch'];

export type DishSort = 'usage' | 'name' | 'recent' | 'score';
export type CatalogPeriod = 'all' | '7d' | '30d' | '90d' | '12m';

export interface CatalogQuery {
  q?: string;
  new_only?: boolean;
  category_ids?: string;
  tag_ids?: string;
  certification_ids?: string;
  period?: CatalogPeriod;
  order?: 'asc' | 'desc';
}

export interface DishPage {
  items: Dish[];
  total_count: number;
}

export interface LabelChanges {
  category_id?: number;
  add_tag_ids?: string[];
  remove_tag_ids?: string[];
  add_certification_ids?: string[];
  remove_certification_ids?: string[];
}

const MAX_PER_PAGE = 200;

function dishesPath(ref: SiteRef): string {
  return `${sitePath(ref)}/dishes`;
}

export const dishesApi = {
  list: async (
    ref: SiteRef,
    params: CatalogQuery & { sort?: DishSort; page?: number; per_page?: number } = {}
  ): Promise<DishPage> => (await api.get(dishesPath(ref), { params })).data,

  /** Every page of the catalog: a site holds a few hundred dishes at most. */
  listAll: async (ref: SiteRef, params: CatalogQuery & { sort?: DishSort } = {}): Promise<Dish[]> => {
    const dishes: Dish[] = [];
    for (let page = 1; ; page += 1) {
      const { items, total_count } = await dishesApi.list(ref, {
        ...params,
        page,
        per_page: MAX_PER_PAGE,
      });
      dishes.push(...items);
      if (items.length === 0 || dishes.length >= total_count) return dishes;
    }
  },

  get: async (ref: SiteRef, dishId: number): Promise<Dish> =>
    (await api.get(`${dishesPath(ref)}/${dishId}`)).data,

  create: async (ref: SiteRef, data: DishInput): Promise<Dish> =>
    (await api.post(dishesPath(ref), data)).data,

  update: async (ref: SiteRef, dishId: number, data: DishPatch): Promise<Dish> =>
    (await api.patch(`${dishesPath(ref)}/${dishId}`, data)).data,

  remove: async (ref: SiteRef, dishId: number): Promise<void> => {
    await api.delete(`${dishesPath(ref)}/${dishId}`);
  },

  uploadImage: async (ref: SiteRef, dishId: number, file: File): Promise<Dish> => {
    const formData = new FormData();
    formData.append('file', file);
    return (
      await api.put(`${dishesPath(ref)}/${dishId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
    ).data;
  },

  removeImage: async (ref: SiteRef, dishId: number): Promise<void> => {
    await api.delete(`${dishesPath(ref)}/${dishId}/image`);
  },

  getStats: async (ref: SiteRef, dishId: number, period?: CatalogPeriod): Promise<DishStats> =>
    (await api.get(`${dishesPath(ref)}/${dishId}/stats`, { params: { period } })).data,

  compare: async (ref: SiteRef, ids: number[], period?: CatalogPeriod): Promise<DishStats[]> =>
    (await api.get(`${dishesPath(ref)}/stats`, { params: { ids: ids.join(','), period } })).data
      .items,

  batchDelete: async (ref: SiteRef, ids: number[]): Promise<DishBatchDeleteResult> =>
    (await api.post(`${dishesPath(ref)}/batch-delete`, { ids })).data,

  batchUpdate: async (
    ref: SiteRef,
    ids: number[],
    changes: LabelChanges
  ): Promise<DishBatchUpdateResult> =>
    (await api.post(`${dishesPath(ref)}/batch-update`, { ids, ...changes })).data,

  exportCsv: async (ref: SiteRef, params: { ids?: number[] } & CatalogQuery): Promise<Blob> => {
    const { ids, ...filters } = params;
    const response = await api.get(`${dishesPath(ref)}/export`, {
      params: ids?.length ? { ids: ids.join(',') } : filters,
      responseType: 'blob',
    });
    return response.data;
  },
};
