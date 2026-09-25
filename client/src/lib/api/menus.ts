import { api, publicAxios, PUBLIC_API_TIMEOUT_MS } from './client';
import type { DishCatalogItem } from './catalog';

export type MenuDayStatus = 'published' | 'draft' | 'missing' | 'closed';

export interface JourFerie {
  date: string;
  description: string;
}

export interface MenuItem {
  id?: number;
  menu_id?: number;
  category_id: number;
  dish_id: number;
  dish?: DishCatalogItem;
  order?: number;
  is_out_of_stock?: boolean;
}

export interface Menu {
  id: number;
  restaurant_id: number;
  date: string;
  status: 'draft' | 'published';
  items: MenuItem[];
  chef_note?: string;
  published_at?: string;
  substitutions?: Record<string, Array<{ dish: DishCatalogItem; order: number }>>;
}

export const menusApi = {
  getWeek: async (weekOffset = 0, restaurantId?: number) => {
    const params: Record<string, string | number> = { week_offset: weekOffset };
    if (restaurantId) params.restaurant_id = restaurantId;
    // The route reads restaurant_id only for anonymous visitors; a JWT caller is
    // scoped by the header.
    const response = await api.get('/menus/week', {
      params,
      headers: restaurantId ? { 'X-Restaurant-Id': String(restaurantId) } : undefined,
    });
    return response.data;
  },

  getByDate: async (date: string, restaurantId?: number): Promise<Menu | null> => {
    const params: Record<string, number> = {};
    if (restaurantId) params.restaurant_id = restaurantId;
    const response = await api.get(`/menus/by-date/${date}`, { params });
    return response.data.menu ?? null;
  },

  save: async (
    date: string,
    items: Array<
      | MenuItem
      | {
          category_id: number;
          dish_id?: number;
          name?: string;
          tag_ids?: string[];
          certification_ids?: string[];
          order?: number;
        }
    >,
    restaurantId?: number,
    chefNote?: string
  ) => {
    const payload: Record<string, unknown> = { date, items, restaurant_id: restaurantId };
    if (chefNote !== undefined) payload.chef_note = chefNote;
    const response = await api.post('/menus', payload);
    return response.data.menu;
  },

  publish: async (menuId: number) => {
    const response = await api.post(`/menus/${menuId}/publish`);
    return response.data.menu;
  },

  unpublish: async (menuId: number) => {
    const response = await api.post(`/menus/${menuId}/unpublish`);
    return response.data.menu;
  },

  delete: async (menuId: number) => {
    await api.delete(`/menus/${menuId}`);
  },

  publishWeek: async (weekOffset = 0, restaurantId?: number) => {
    const response = await api.post('/menus/week/publish', {
      week_offset: weekOffset,
      restaurant_id: restaurantId,
    });
    return response.data;
  },

  updateChefNote: async (menuId: number, chefNote: string | null) => {
    const response = await api.put(`/menus/${menuId}/chef-note`, {
      chef_note: chefNote,
    });
    return response.data.menu as Menu;
  },

  updateItemStock: async (menuId: number, itemId: number, isOutOfStock: boolean) => {
    const response = await api.patch(`/menus/${menuId}/items/${itemId}/stock`, {
      is_out_of_stock: isOutOfStock,
    });
    return response.data.item as MenuItem;
  },

  getSubstitutions: async (menuId: number) => {
    const response = await api.get(`/menus/${menuId}/substitutions`);
    return response.data.substitutions as Record<
      string,
      Array<{ dish: DishCatalogItem; order: number }>
    >;
  },

  updateSubstitutions: async (menuId: number, categoryId: number, dishIds: number[]) => {
    const response = await api.put(`/menus/${menuId}/substitutions/${categoryId}`, {
      dish_ids: dishIds,
    });
    return response.data.substitutions as Record<
      string,
      Array<{ dish: DishCatalogItem; order: number }>
    >;
  },

  getJoursFeries: async (year: number): Promise<JourFerie[]> => {
    const response = await publicAxios.get(`/menus/jours-feries/${year}`, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data.jours_feries as JourFerie[];
  },

  getToday: async (restaurantSlug: string) => {
    const response = await publicAxios.get(`/public/${restaurantSlug}/today`, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data;
  },

  getTomorrow: async (restaurantSlug: string) => {
    const response = await publicAxios.get(`/public/${restaurantSlug}/tomorrow`, {
      timeout: PUBLIC_API_TIMEOUT_MS,
    });
    return response.data;
  },
};
