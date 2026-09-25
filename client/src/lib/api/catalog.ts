import { api } from './client';
import type { CertificationItem, DietaryTag } from './taxonomy';

export interface DishCatalogItem {
  id: number;
  restaurant_id: number;
  category_id: number | null;
  name: string;
  image_url: string | null;
  usage_count: number;
  votes: number;
  score: number | null;
  tags: DietaryTag[];
  certifications: CertificationItem[];
  created_at?: string;
}

export type DishSort = 'usage' | 'name' | 'recent' | 'score';
export type CatalogPeriod = 'all' | '7d' | '30d' | '90d' | '12m';

export interface CatalogQuery {
  q?: string;
  new_only?: string;
  category_ids?: string;
  tag_ids?: string;
  certification_ids?: string;
  period?: CatalogPeriod;
  order?: 'asc' | 'desc';
}

export interface CatalogListResponse {
  dishes: DishCatalogItem[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface BulkDeleteResult {
  deleted: number[];
  kept: { id: number; name: string; usage_count: number }[];
}

export interface DishSatisfaction {
  /** The site collects votes at all. */
  enabled: boolean;
  /** This dish's category is among those a vote may name. */
  votable: boolean;
  icon_preset: string;
  votes: number;
  score: number | null;
  distribution: Record<'1' | '2' | '3', number>;
  series: { date: string; votes: number; score: number }[];
  /** Null while the dish has too few votes to be ranked among its peers. */
  standing: { rank: number; rated_in_category: number; gap_to_average: number } | null;
}

export interface DishStats {
  week: number;
  month: number;
  semester: number;
  year: number;
  history: { week: string; count: number }[];
  satisfaction: DishSatisfaction;
}

export const catalogApi = {
  list: async (params?: { category_ids?: string; q?: string; sort?: DishSort }) => {
    const response = await api.get('/catalog', { params });
    return response.data.dishes as DishCatalogItem[];
  },

  listPaginated: async (
    params: CatalogQuery & {
      sort?: DishSort;
      page: number;
      per_page?: number;
    }
  ) => {
    const response = await api.get('/catalog', { params });
    return response.data as CatalogListResponse;
  },

  getStatsBatch: async (ids: number[], period?: CatalogPeriod) => {
    const response = await api.get('/catalog/stats', {
      params: { ids: ids.join(','), period },
    });
    return response.data.stats as Record<string, DishStats>;
  },

  create: async (data: {
    name: string;
    category_id?: number | null;
    tag_ids?: string[];
    certification_ids?: string[];
  }) => {
    const response = await api.post('/catalog', data);
    return response.data.dish as DishCatalogItem;
  },

  get: async (dishId: number) => {
    const response = await api.get(`/catalog/${dishId}`);
    return response.data.dish as DishCatalogItem;
  },

  update: async (
    dishId: number,
    data: {
      name?: string;
      category_id?: number | null;
      tag_ids?: string[];
      certification_ids?: string[];
    }
  ) => {
    const response = await api.put(`/catalog/${dishId}`, data);
    return response.data.dish as DishCatalogItem;
  },

  delete: async (dishId: number) => {
    await api.delete(`/catalog/${dishId}`);
  },

  uploadImage: async (dishId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/catalog/${dishId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return response.data.dish as DishCatalogItem;
  },

  removeImage: async (dishId: number) => {
    const response = await api.delete(`/catalog/${dishId}/image`);
    return response.data;
  },

  getStats: async (dishId: number, period?: CatalogPeriod): Promise<DishStats> => {
    const response = await api.get(`/catalog/${dishId}/stats`, { params: { period } });
    return response.data as DishStats;
  },

  bulkDelete: async (ids: number[]) => {
    const response = await api.post('/catalog/bulk/delete', { ids });
    return response.data as BulkDeleteResult;
  },

  bulkCategory: async (ids: number[], categoryId: number) => {
    const response = await api.post('/catalog/bulk/category', { ids, category_id: categoryId });
    return response.data as { moved: number[]; kept: { id: number; name: string }[] };
  },

  bulkLabels: async (
    ids: number[],
    changes: {
      add_tag_ids?: string[];
      remove_tag_ids?: string[];
      add_certification_ids?: string[];
      remove_certification_ids?: string[];
    }
  ) => {
    const response = await api.post('/catalog/bulk/labels', { ids, ...changes });
    return response.data.updated as number[];
  },

  exportCsv: async (params: { ids?: number[] } & CatalogQuery) => {
    const { ids, ...filters } = params;
    const response = await api.get('/catalog/export', {
      params: ids?.length ? { ids: ids.join(',') } : filters,
      responseType: 'blob',
    });
    return response.data as Blob;
  },
};
