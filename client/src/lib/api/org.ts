import { api } from './client';
import type { CatalogPeriod } from './catalog';
import type { MenuDayStatus } from './menus';

export interface OrgSite {
  id: number;
  name: string;
  slug?: string | null;
  is_active: boolean;
  user_count: number;
  today_menu_status: MenuDayStatus;
  upcoming_events: number;
  last_published_at: string | null;
}

export interface OrgCatalogSite {
  site_id: number;
  site_name: string;
  dish_id: number;
  has_image: boolean;
}

export interface OrgCatalogDish {
  normalized_name: string;
  display_name: string;
  image_url: string | null;
  site_count: number;
  photo_count: number;
  usage_count: number;
  votes: number;
  score: number | null;
  sites: OrgCatalogSite[];
}

export interface OrgCatalogPage {
  dishes: OrgCatalogDish[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export type OrgCatalogSort = 'usage' | 'sites' | 'name' | 'photos' | 'score';

export interface OrgCatalogGroupSite extends OrgCatalogSite {
  usage_count: number;
  votes: number;
  score: number | null;
}

export interface OrgCatalogGroup {
  normalized_name: string;
  display_name: string;
  image_url: string | null;
  site_count: number;
  photo_count: number;
  usage_count: number;
  votes: number;
  score: number | null;
  distribution: Record<'1' | '2' | '3', number>;
  series: { date: string; votes: number; score: number }[];
  sites: OrgCatalogGroupSite[];
}

export const orgApi = {
  getSites: async (): Promise<OrgSite[]> => {
    const response = await api.get('/org/sites');
    return (response.data.sites ?? []) as OrgSite[];
  },
  getCatalog: async (params: {
    q?: string;
    sort?: OrgCatalogSort;
    order?: 'asc' | 'desc';
    period?: CatalogPeriod;
    page?: number;
    per_page?: number;
  }): Promise<OrgCatalogPage> => {
    const response = await api.get('/org/catalog', { params });
    return response.data as OrgCatalogPage;
  },
  getCatalogGroup: async (normalizedName: string): Promise<OrgCatalogGroup> => {
    const response = await api.get('/org/catalog/group', { params: { name: normalizedName } });
    return response.data as OrgCatalogGroup;
  },
};
